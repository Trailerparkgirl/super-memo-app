import type { Grade, RecordLogItem } from 'ts-fsrs'
import {
  logFromRow,
  logToRow,
  memoFromRow,
  memoToRow,
  reviveCard,
  supabase,
  type Memo,
  type MemoRow,
  type MemoType,
  type ReviewLog,
  type ReviewLogRow,
} from './db'
import { endOfDay, newCard } from './scheduler'
import { notifyChange } from './useData'

export interface MemoInput {
  type: MemoType
  title: string
  body: string
  tags: string[]
}

type Result<T> = PromiseLike<{ data: T | null; error: unknown }>
type CountResult = PromiseLike<{ count: number | null; error: unknown }>

async function run<T>(query: Result<T>): Promise<T> {
  const { data, error } = await query
  if (error) throw error
  return data as T
}

async function runCount(query: CountResult): Promise<number> {
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

// Supabase は1回に最大1000行しか返さないので、分けて全部取ってくる
const PAGE = 1000

async function selectAll<T>(page: (from: number, to: number) => Result<T[]>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const chunk = await run(page(from, from + PAGE - 1))
    rows.push(...chunk)
    if (chunk.length < PAGE) return rows
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))
}

// ---- 読み込み ----

export async function getMemo(id: string): Promise<Memo | null> {
  const row = await run<MemoRow>(supabase.from('memos').select().eq('id', id).maybeSingle())
  return row && memoFromRow(row)
}

/** 新しい順 */
export async function listMemos(): Promise<Memo[]> {
  const rows = await selectAll<MemoRow>((from, to) =>
    supabase.from('memos').select().order('created_at', { ascending: false }).order('id').range(from, to),
  )
  return rows.map(memoFromRow)
}

/** 今日までに復習するメモ（予定日の早い順） */
export async function listDueMemos(now = new Date()): Promise<Memo[]> {
  const rows = await selectAll<MemoRow>((from, to) =>
    supabase.from('memos').select().lte('due', endOfDay(now).toISOString()).order('due').order('id').range(from, to),
  )
  return rows.map(memoFromRow)
}

export function countDueMemos(now = new Date()): Promise<number> {
  return runCount(supabase.from('memos').select('*', { count: 'exact', head: true }).lte('due', endOfDay(now).toISOString()))
}

export function countMemos(): Promise<number> {
  return runCount(supabase.from('memos').select('*', { count: 'exact', head: true }))
}

export function countReviewsSince(since: Date): Promise<number> {
  return runCount(supabase.from('review_logs').select('*', { count: 'exact', head: true }).gte('reviewed_at', since.toISOString()))
}

/** 期間内に復習予定があるメモの予定日時（タイムスタンプ） */
export async function listDueDates(from: Date, to: Date): Promise<number[]> {
  const rows = await selectAll<{ due: string }>((start, end) =>
    supabase
      .from('memos')
      .select('due')
      .gte('due', from.toISOString())
      .lte('due', to.toISOString())
      .order('due')
      .order('id')
      .range(start, end),
  )
  return rows.map((r) => new Date(r.due).getTime())
}

/** 新しい順 */
export async function listLogs(memoId: string): Promise<ReviewLog[]> {
  const rows = await selectAll<ReviewLogRow>((from, to) =>
    supabase.from('review_logs').select().eq('memo_id', memoId).order('reviewed_at', { ascending: false }).range(from, to),
  )
  return rows.map(logFromRow)
}

// ---- 書き込み ----

export async function createMemo(input: MemoInput): Promise<string> {
  const now = new Date()
  const card = newCard(now)
  const id = crypto.randomUUID()
  await run(supabase.from('memos').insert(memoToRow({ ...input, id, createdAt: now, updatedAt: now, card, due: card.due.getTime() })))
  notifyChange()
  return id
}

export async function updateMemo(id: string, input: MemoInput) {
  await run(supabase.from('memos').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id))
  notifyChange()
}

/** 復習の記録もデータベース側で一緒に消える */
export async function deleteMemo(id: string) {
  await run(supabase.from('memos').delete().eq('id', id))
  notifyChange()
}

/** 覚え直し：学習状況を初期化して翌日から復習し直す */
export async function resetMemo(id: string) {
  const card = newCard()
  await run(supabase.from('memos').update({ card, due: card.due.toISOString() }).eq('id', id))
  notifyChange()
}

export async function recordReview(memo: Memo, grade: Grade, result: RecordLogItem) {
  await run(supabase.from('memos').update({ card: result.card, due: result.card.due.toISOString() }).eq('id', memo.id))
  await run(
    supabase.from('review_logs').insert(
      logToRow({
        memoId: memo.id,
        rating: grade,
        reviewedAt: result.log.review,
        scheduledDays: result.card.scheduled_days,
        log: result.log,
        cardBefore: memo.card,
      }),
    ),
  )
  notifyChange()
}

export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,、\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean))]
}

// ---- バックアップ ----

interface Backup {
  app: 'super-memo'
  version: 1
  exportedAt: string
  memos: Memo[]
  logs: ReviewLog[]
}

export async function exportBackup(): Promise<Blob> {
  const logs = await selectAll<ReviewLogRow>((from, to) => supabase.from('review_logs').select().order('id').range(from, to))
  const backup: Backup = {
    app: 'super-memo',
    version: 1,
    exportedAt: new Date().toISOString(),
    memos: await listMemos(),
    logs: logs.map(logFromRow),
  }
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
}

export class InvalidBackupError extends Error {}

/**
 * バックアップを読み込む。同じIDのメモは上書きする。
 * 端末に保存していた頃のバックアップもそのまま読める。
 * 途中で失敗しても、もう一度読み込めば最後まで反映される。
 */
export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as Backup
  if (data.app !== 'super-memo' || !Array.isArray(data.memos)) {
    throw new InvalidBackupError()
  }
  const memos: Memo[] = data.memos.map((m) => {
    const card = reviveCard(m.card)
    return { ...m, createdAt: new Date(m.createdAt), updatedAt: new Date(m.updatedAt), card, due: card.due.getTime() }
  })
  const ids = new Set(memos.map((m) => m.id))
  const logs = (data.logs ?? [])
    .filter((l) => ids.has(l.memoId))
    .map((l) => logToRow({ ...l, reviewedAt: new Date(l.reviewedAt) }))

  for (const chunk of chunks(memos, 500)) {
    await run(supabase.from('memos').upsert(chunk.map(memoToRow)))
  }
  for (const chunk of chunks([...ids], 100)) {
    await run(supabase.from('review_logs').delete().in('memo_id', chunk))
  }
  for (const chunk of chunks(logs, 500)) {
    await run(supabase.from('review_logs').insert(chunk))
  }
  notifyChange()
  return memos.length
}
