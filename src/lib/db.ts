import { createClient } from '@supabase/supabase-js'
import type { Card, Grade, ReviewLog as FsrsReviewLog } from 'ts-fsrs'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を .env.local（Vercel では Environment Variables）に設定してください')
}

export const supabase = createClient(url, key)

/** note: 自由メモ / qa: 問題と答え / word: 単語（フラッシュカード用） */
export type MemoType = 'note' | 'qa' | 'word'

/** 勉強している言語。en: 英語 / de: ドイツ語 / ja: 日本語 */
export type StudyLang = 'en' | 'de' | 'ja'

export interface Memo {
  id: string
  type: MemoType
  lang: StudyLang
  /** 自由メモ: タイトル / 問題形式: 問題 / 単語: 単語 */
  title: string
  /** 自由メモ: 本文 / 問題形式: 答え / 単語: 意味 */
  body: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
  card: Card
  /** card.due のタイムスタンプ */
  due: number
}

/** map: ふつうのマップ / inbox: 受信箱（＋で書いた一言をためておく。1人に1つ） */
export type MapKind = 'map' | 'inbox'

export interface MindMap {
  id: string
  kind: MapKind
  createdAt: Date
}

/** マップの項目。parentId が null のものがマップの中心（テーマ） */
export interface MapNode {
  id: string
  mapId: string
  parentId: string | null
  /** 兄弟の中での順番（小さいほど先） */
  position: number
  title: string
  /** 定義。マップには出さず、項目を開いたときと復習のときに見る */
  definition: string
  /** テーマから出る枝の色（BRANCH_COLORS のキー）。その先の枝は親の色を受け継ぐ */
  color: string | null
  createdAt: Date
  updatedAt: Date
}

/** explain: 定義を思い出す / children: 枝（子の項目）を思い出す */
export type CardKind = 'explain' | 'children'

/** マップの項目の復習カード */
export interface NodeCard {
  id: string
  nodeId: string
  kind: CardKind
  card: Card
  /** card.due のタイムスタンプ */
  due: number
}

export interface ReviewLog {
  id?: number
  /** 単語の復習ならメモの ID */
  memoId?: string
  /** マップの復習ならカードの ID */
  cardId?: string
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
  lang: StudyLang
  title: string
  body: string
  tags: string[]
  created_at: string
  updated_at: string
  card: Card
  due: string
}

export interface MapRow {
  id: string
  kind: MapKind
  created_at: string
}

export interface NodeRow {
  id: string
  map_id: string
  parent_id: string | null
  position: number
  title: string
  definition: string
  color: string | null
  created_at: string
  updated_at: string
}

export interface CardRow {
  id: string
  node_id: string
  kind: CardKind
  card: Card
  due: string
}

export interface ReviewLogRow {
  id: number
  memo_id: string | null
  card_id: string | null
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
    // 言語の列を足す前のデータベースでも読めるようにする
    lang: row.lang ?? 'en',
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
    lang: memo.lang,
    title: memo.title,
    body: memo.body,
    tags: memo.tags,
    created_at: memo.createdAt.toISOString(),
    updated_at: memo.updatedAt.toISOString(),
    card: memo.card,
    due: memo.card.due.toISOString(),
  }
}

export function mapFromRow(row: MapRow): MindMap {
  return { id: row.id, kind: row.kind, createdAt: new Date(row.created_at) }
}

export function mapToRow(map: MindMap): MapRow {
  return { id: map.id, kind: map.kind, created_at: map.createdAt.toISOString() }
}

export function nodeFromRow(row: NodeRow): MapNode {
  return {
    id: row.id,
    mapId: row.map_id,
    parentId: row.parent_id,
    position: row.position,
    title: row.title,
    definition: row.definition,
    color: row.color,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function nodeToRow(node: MapNode): NodeRow {
  return {
    id: node.id,
    map_id: node.mapId,
    parent_id: node.parentId,
    position: node.position,
    title: node.title,
    definition: node.definition,
    color: node.color,
    created_at: node.createdAt.toISOString(),
    updated_at: node.updatedAt.toISOString(),
  }
}

export function cardFromRow(row: CardRow): NodeCard {
  const card = reviveCard(row.card)
  return { id: row.id, nodeId: row.node_id, kind: row.kind, card, due: card.due.getTime() }
}

export function cardToRow(card: NodeCard): CardRow {
  return { id: card.id, node_id: card.nodeId, kind: card.kind, card: card.card, due: card.card.due.toISOString() }
}

export function logFromRow(row: ReviewLogRow): ReviewLog {
  return {
    id: row.id,
    memoId: row.memo_id ?? undefined,
    cardId: row.card_id ?? undefined,
    rating: row.rating,
    reviewedAt: new Date(row.reviewed_at),
    scheduledDays: row.scheduled_days,
    log: row.log ? reviveLog(row.log) : undefined,
    cardBefore: row.card_before ? reviveCard(row.card_before) : undefined,
  }
}

export function logToRow(log: ReviewLog): Omit<ReviewLogRow, 'id'> {
  return {
    memo_id: log.memoId ?? null,
    card_id: log.cardId ?? null,
    rating: log.rating,
    reviewed_at: log.reviewedAt.toISOString(),
    scheduled_days: log.scheduledDays,
    log: log.log ?? null,
    card_before: log.cardBefore ?? null,
  }
}
