import Dexie, { type EntityTable } from 'dexie'
import type { Card, Grade } from 'ts-fsrs'

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
  /** card.due のタイムスタンプ（インデックス用） */
  due: number
}

export interface ReviewLog {
  id?: number
  memoId: string
  rating: Grade
  reviewedAt: Date
  /** 次の復習までの日数 */
  scheduledDays: number
}

export const db = new Dexie('super-memo') as Dexie & {
  memos: EntityTable<Memo, 'id'>
  logs: EntityTable<ReviewLog, 'id'>
}

db.version(1).stores({
  memos: 'id, due, createdAt, *tags',
  logs: '++id, memoId, reviewedAt',
})
