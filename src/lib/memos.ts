import type { Card, Grade, RecordLogItem } from 'ts-fsrs'
import { db, type Memo, type MemoType, type ReviewLog } from './db'
import { endOfDay, newCard } from './scheduler'

export interface MemoInput {
  type: MemoType
  title: string
  body: string
  tags: string[]
}

export async function createMemo(input: MemoInput): Promise<string> {
  const now = new Date()
  const card = newCard(now)
  const id = crypto.randomUUID()
  await db.memos.add({ ...input, id, createdAt: now, updatedAt: now, card, due: card.due.getTime() })
  return id
}

export async function updateMemo(id: string, input: MemoInput) {
  await db.memos.update(id, { ...input, updatedAt: new Date() })
}

export async function deleteMemo(id: string) {
  await db.transaction('rw', db.memos, db.logs, async () => {
    await db.memos.delete(id)
    await db.logs.where('memoId').equals(id).delete()
  })
}

/** 覚え直し：学習状況を初期化して翌日から復習し直す */
export async function resetMemo(id: string) {
  const card = newCard()
  await db.memos.update(id, { card, due: card.due.getTime() })
}

export async function recordReview(memo: Memo, grade: Grade, result: RecordLogItem) {
  await db.transaction('rw', db.memos, db.logs, async () => {
    await db.memos.update(memo.id, { card: result.card, due: result.card.due.getTime() })
    await db.logs.add({
      memoId: memo.id,
      rating: grade,
      reviewedAt: result.log.review,
      scheduledDays: result.card.scheduled_days,
    })
  })
}

export function dueMemosQuery(now = new Date()) {
  return db.memos.where('due').belowOrEqual(endOfDay(now).getTime())
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
  const backup: Backup = {
    app: 'super-memo',
    version: 1,
    exportedAt: new Date().toISOString(),
    memos: await db.memos.toArray(),
    logs: await db.logs.toArray(),
  }
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
}

function reviveCard(card: Card): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}

export class InvalidBackupError extends Error {}

/** バックアップを読み込む。同じIDのメモは上書きする。 */
export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as Backup
  if (data.app !== 'super-memo' || !Array.isArray(data.memos)) {
    throw new InvalidBackupError()
  }
  const memos: Memo[] = data.memos.map((m) => {
    const card = reviveCard(m.card)
    return {
      ...m,
      createdAt: new Date(m.createdAt),
      updatedAt: new Date(m.updatedAt),
      card,
      due: card.due.getTime(),
    }
  })
  const logs: ReviewLog[] = (data.logs ?? []).map(({ id: _id, ...l }) => ({
    ...l,
    reviewedAt: new Date(l.reviewedAt),
  }))
  await db.transaction('rw', db.memos, db.logs, async () => {
    const ids = memos.map((m) => m.id)
    await db.logs.where('memoId').anyOf(ids).delete()
    await db.memos.bulkPut(memos)
    await db.logs.bulkAdd(logs)
  })
  return memos.length
}
