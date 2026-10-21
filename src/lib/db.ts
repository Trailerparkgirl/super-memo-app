import { createClient } from '@supabase/supabase-js'
import type { Card, Grade, ReviewLog as FsrsReviewLog } from 'ts-fsrs'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を .env.local（Vercel では Environment Variables）に設定してください')
}

export const supabase = createClient(url, key)

export type MemoType = 'note' | 'qa'

export interface Memo {
  id: string
  type: MemoType
  /** 自由メモ: タイトル / 問題形式: 問題 */
  title: string
  /** 自由メモ: 本文 / 問題形式: 答え */
  body: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
  card: Card
  /** card.due のタイムスタンプ */
  due: number
}

export interface ReviewLog {
  id?: number
  memoId: string
  rating: Grade
  reviewedAt: Date
  /** 次の復習までの日数 */
  scheduledDays: number
  /** ts-fsrs の記録（取り消しやパラメータ最適化用） */
  log?: FsrsReviewLog
  /** 評価する前のカード（取り消し用） */
  cardBefore?: Card
}

// ---- データベースの行との変換（JSONに入れた日付は文字列で返ってくる） ----

export interface MemoRow {
  id: string
  type: MemoType
  title: string
  body: string
  tags: string[]
  created_at: string
  updated_at: string
  card: Card
  due: string
}

export interface ReviewLogRow {
  id: number
  memo_id: string
  rating: Grade
  reviewed_at: string
  scheduled_days: number
  log: FsrsReviewLog | null
  card_before: Card | null
}

export function reviveCard(card: Card): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}

function reviveLog(log: FsrsReviewLog): FsrsReviewLog {
  return { ...log, due: new Date(log.due), review: new Date(log.review) }
}

export function memoFromRow(row: MemoRow): Memo {
  const card = reviveCard(row.card)
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    tags: row.tags,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    card,
    due: card.due.getTime(),
  }
}

export function memoToRow(memo: Memo): MemoRow {
  return {
    id: memo.id,
    type: memo.type,
    title: memo.title,
    body: memo.body,
    tags: memo.tags,
    created_at: memo.createdAt.toISOString(),
    updated_at: memo.updatedAt.toISOString(),
    card: memo.card,
    due: memo.card.due.toISOString(),
  }
}

export function logFromRow(row: ReviewLogRow): ReviewLog {
  return {
    id: row.id,
    memoId: row.memo_id,
    rating: row.rating,
    reviewedAt: new Date(row.reviewed_at),
    scheduledDays: row.scheduled_days,
    log: row.log ? reviveLog(row.log) : undefined,
    cardBefore: row.card_before ? reviveCard(row.card_before) : undefined,
  }
}

export function logToRow(log: ReviewLog): Omit<ReviewLogRow, 'id'> {
  return {
    memo_id: log.memoId,
    rating: log.rating,
    reviewed_at: log.reviewedAt.toISOString(),
    scheduled_days: log.scheduledDays,
    log: log.log ?? null,
    card_before: log.cardBefore ?? null,
  }
}
