import type { Card, Grade, RecordLogItem } from 'ts-fsrs'
import {
  logFromRow,
  logToRow,
  memoFromRow,
  memoToRow,
  supabase,
  type Memo,
  type MemoRow,
  type MemoType,
  type ReviewLog,
  type ReviewLogRow,
  type StudyLang,
} from './db'
import type { StudyFilter } from './languages'
import { chunks, run, runCount, selectAll } from './query'
import { endOfDay, newCard } from './scheduler'
import { notifyChange } from './useData'
import type { WordListItem } from './wordList'

export interface MemoInput {
  type: MemoType
  lang: StudyLang
  title: string
  body: string
  tags: string[]
}

/** 'all' でなければ、その言語のメモだけにする */
function inLang<Q>(query: Q, lang: StudyFilter): Q {
  // Supabase の型は込み入っていて、型の条件で書くと計算が終わらないので、eq を持つものとして扱う
  return lang === 'all' ? query : (query as { eq(column: string, value: string): Q }).eq('lang', lang)
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

/** 今日までに復習するメモ（予定日の早い順）。tag を指定すると、そのタグのメモだけ */
export async function listDueMemos(now = new Date(), tag?: string, lang: StudyFilter = 'all'): Promise<Memo[]> {
  const rows = await selectAll<MemoRow>((from, to) => {
    const query = inLang(supabase.from('memos').select().lte('due', endOfDay(now).toISOString()), lang)
    return (tag ? query.contains('tags', [tag]) : query).order('due').order('id').range(from, to)
  })
  return rows.map(memoFromRow)
}

/** 今日までに復習するメモのタグと、タグごとの件数（タグ名の順） */
export async function listDueTags(now = new Date(), lang: StudyFilter = 'all'): Promise<[string, number][]> {
  const rows = await selectAll<{ tags: string[] }>((from, to) =>
    inLang(supabase.from('memos').select('tags').lte('due', endOfDay(now).toISOString()), lang).order('id').range(from, to),
  )
  const counts = new Map<string, number>()
  for (const tag of rows.flatMap((r) => r.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts].sort(([a], [b]) => a.localeCompare(b))
}

export function countDueMemos(now = new Date(), lang: StudyFilter = 'all'): Promise<number> {
  return runCount(inLang(supabase.from('memos').select('*', { count: 'exact', head: true }).lte('due', endOfDay(now).toISOString()), lang))
}

export function countMemos(lang: StudyFilter = 'all'): Promise<number> {
  return runCount(inLang(supabase.from('memos').select('*', { count: 'exact', head: true }), lang))
}

export function countReviewsSince(since: Date): Promise<number> {
  return runCount(supabase.from('review_logs').select('*', { count: 'exact', head: true }).gte('reviewed_at', since.toISOString()))
}

/** 期間内に復習予定があるメモの予定日時（タイムスタンプ） */
export async function listDueDates(from: Date, to: Date, lang: StudyFilter = 'all'): Promise<number[]> {
  const rows = await selectAll<{ due: string }>((start, end) =>
    inLang(supabase.from('memos').select('due').gte('due', from.toISOString()).lte('due', to.toISOString()), lang)
      .order('due')
      .order('id')
      .range(start, end),
  )
  return rows.map((r) => new Date(r.due).getTime())
}

/** 復習した日（YYYY-MM-DD、この端末の時間帯）ごとの件数 */
export async function reviewDayCounts(): Promise<Map<string, number>> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const rows = await selectAll<{ day: string; count: number }>((from, to) => supabase.rpc('review_days', { tz }).range(from, to))
  return new Map(rows.map((r) => [r.day, Number(r.count)]))
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

/** 復習の記録のIDを返す（取り消しに使う） */
export async function recordReview(memo: Memo, grade: Grade, result: RecordLogItem): Promise<number> {
  await run(supabase.from('memos').update({ card: result.card, due: result.card.due.toISOString() }).eq('id', memo.id))
  const log = await run<{ id: number }>(
    supabase
      .from('review_logs')
      .insert(
        logToRow({
          memoId: memo.id,
          rating: grade,
          reviewedAt: result.log.review,
          scheduledDays: result.card.scheduled_days,
          log: result.log,
          cardBefore: memo.card,
        }),
      )
      .select('id')
      .single(),
  )
  notifyChange()
  return log.id
}

/** 評価の取り消し：カードを評価する前に戻し、復習の記録も消す */
export async function undoReview(memoId: string, logId: number, cardBefore: Card) {
  await run(supabase.from('memos').update({ card: cardBefore, due: cardBefore.due.toISOString() }).eq('id', memoId))
  await run(supabase.from('review_logs').delete().eq('id', logId))
  notifyChange()
}

export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,、\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean))]
}

// ---- 単語リスト ----

/**
 * 単語リストを lang の「単語」のメモとして追加する。翌日から復習に出る。
 * その言語にすでにある単語（大文字・小文字は区別しない）と、リストの中で重複している単語は追加しない。
 */
export async function importWords(items: WordListItem[], lang: StudyLang): Promise<{ added: number; skipped: number }> {
  const existing = await selectAll<{ title: string }>((from, to) =>
    supabase.from('memos').select('title').eq('type', 'word').eq('lang', lang).order('id').range(from, to),
  )
  const seen = new Set(existing.map((m) => m.title.trim().toLowerCase()))
  const now = new Date()
  const memos: Memo[] = []
  for (const { word, meaning, tags } of items) {
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const card = newCard(now)
    memos.push({ id: crypto.randomUUID(), type: 'word', lang, title: word, body: meaning, tags, createdAt: now, updatedAt: now, card, due: card.due.getTime() })
  }
  for (const chunk of chunks(memos, 500)) {
    await run(supabase.from('memos').insert(chunk.map(memoToRow)))
  }
  notifyChange()
  return { added: memos.length, skipped: items.length - memos.length }
}
