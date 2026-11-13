import type { Card, Grade, RecordLogItem } from 'ts-fsrs'
import {
  cardFromRow,
  logToRow,
  mapFromRow,
  nodeFromRow,
  nodeToRow,
  supabase,
  type CardKind,
  type CardRow,
  type MapNode,
  type MapRow,
  type MindMap,
  type NodeCard,
  type NodeRow,
} from './db'
import { run, selectAll } from './query'
import { endOfDay, newCard } from './scheduler'
import { notifyChange } from './useData'

const MAP_COLUMNS = 'id, kind, created_at'
const NODE_COLUMNS = 'id, map_id, parent_id, position, title, definition, color, created_at, updated_at'
const CARD_COLUMNS = 'id, node_id, kind, card, due'

// ---- 読み込み ----

/** マップ・項目・カードのすべて。個人の知識なので、まとめて読んでも軽い */
export interface Library {
  maps: MindMap[]
  nodes: MapNode[]
  cards: NodeCard[]
}

export async function loadLibrary(): Promise<Library> {
  const [maps, nodes, cards] = await Promise.all([
    selectAll<MapRow>((from, to) => supabase.from('maps').select(MAP_COLUMNS).order('created_at').order('id').range(from, to)),
    selectAll<NodeRow>((from, to) => supabase.from('nodes').select(NODE_COLUMNS).order('id').range(from, to)),
    selectAll<CardRow>((from, to) => supabase.from('cards').select(CARD_COLUMNS).order('id').range(from, to)),
  ])
  return { maps: maps.map(mapFromRow), nodes: nodes.map(nodeFromRow), cards: cards.map(cardFromRow) }
}

/** 1つのマップの項目とカード。マップがなければ null */
export async function loadMap(mapId: string): Promise<{ map: MindMap; nodes: MapNode[]; cards: NodeCard[] } | null> {
  const map = await run<MapRow | null>(supabase.from('maps').select(MAP_COLUMNS).eq('id', mapId).maybeSingle())
  if (!map) return null
  const [nodes, cards] = await Promise.all([
    selectAll<NodeRow>((from, to) => supabase.from('nodes').select(NODE_COLUMNS).eq('map_id', mapId).order('id').range(from, to)),
    selectAll<CardRow>((from, to) =>
      supabase.from('cards').select(`${CARD_COLUMNS}, nodes!inner(map_id)`).eq('nodes.map_id', mapId).order('id').range(from, to),
    ),
  ])
  return { map: mapFromRow(map), nodes: nodes.map(nodeFromRow), cards: cards.map(cardFromRow) }
}

/** 今日までに復習するカードの数（バッジ用。中身が空になったカードも数えるので、少し多めになることがある） */
export async function countDueCards(now = new Date()): Promise<number> {
  const { count, error } = await supabase.from('cards').select('*', { count: 'exact', head: true }).lte('due', endOfDay(now).toISOString())
  if (error) throw error
  return count ?? 0
}

// ---- マップと項目 ----

/** テーマを中心にした新しいマップを作る */
export async function createMap(theme: string): Promise<{ mapId: string; centerId: string }> {
  const mapId = crypto.randomUUID()
  const centerId = crypto.randomUUID()
  await run(supabase.from('maps').insert({ id: mapId, kind: 'map' }))
  await run(supabase.from('nodes').insert({ id: centerId, map_id: mapId, title: theme }))
  notifyChange()
  return { mapId, centerId }
}

/** 受信箱（＋で書いた一言をためておくマップ）。なければ作る */
export async function getInbox(title: string): Promise<{ mapId: string; centerId: string }> {
  let map = await run<{ id: string } | null>(supabase.from('maps').select('id').eq('kind', 'inbox').maybeSingle())
  if (!map) {
    const id = crypto.randomUUID()
    const { error } = await supabase.from('maps').insert({ id, kind: 'inbox' })
    // ほかの端末が先に作っていたら（1人に1つの制約）、そちらを使う
    if (error && (error as { code?: string }).code !== '23505') throw error
    map = error ? await run<{ id: string }>(supabase.from('maps').select('id').eq('kind', 'inbox').single()) : { id }
  }
  const center = await run<{ id: string } | null>(supabase.from('nodes').select('id').eq('map_id', map.id).is('parent_id', null).maybeSingle())
  if (center) return { mapId: map.id, centerId: center.id }
  const centerId = crypto.randomUUID()
  await run(supabase.from('nodes').insert({ id: centerId, map_id: map.id, title }))
  return { mapId: map.id, centerId }
}

/** マップを消す（項目・カード・復習の記録もデータベース側で一緒に消える） */
export async function deleteMap(mapId: string) {
  await run(supabase.from('maps').delete().eq('id', mapId))
  notifyChange()
}

export async function insertNodes(nodes: MapNode[]) {
  await run(supabase.from('nodes').insert(nodes.map(nodeToRow)))
  notifyChange()
}

export async function updateNode(id: string, patch: Partial<Pick<MapNode, 'title' | 'definition' | 'color'>>) {
  await run(supabase.from('nodes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id))
  notifyChange()
}

/** 項目を消す（その先の枝とカードも一緒に消える） */
export async function deleteNode(id: string) {
  await run(supabase.from('nodes').delete().eq('id', id))
  notifyChange()
}

/** 項目を枝ごと別の親の下へ移す（別のマップへも） */
export async function moveNode(id: string, newParentId: string, position: number) {
  await run(supabase.rpc('move_node', { node: id, new_parent: newParentId, new_position: position }))
  notifyChange()
}

// ---- 復習カード ----

/**
 * マップの今の形から、まだない復習カードを作って返す（翌日から復習に出る）。
 * 定義のある項目は「定義」、枝が2つ以上ある項目は「枝」のカード。受信箱は寄せ集めなので「枝」のカードは作らない。
 */
export async function createMissingCards(nodes: MapNode[], cards: NodeCard[], isInbox: boolean): Promise<NodeCard[]> {
  const have = new Set(cards.map((c) => `${c.nodeId}:${c.kind}`))
  const childCounts = new Map<string, number>()
  for (const node of nodes) if (node.parentId) childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1)

  const wanted: { nodeId: string; kind: CardKind }[] = []
  for (const node of nodes) {
    if (node.definition.trim() && !have.has(`${node.id}:explain`)) wanted.push({ nodeId: node.id, kind: 'explain' })
    if (!isInbox && (childCounts.get(node.id) ?? 0) >= 2 && !have.has(`${node.id}:children`)) wanted.push({ nodeId: node.id, kind: 'children' })
  }
  if (wanted.length === 0) return []

  const now = new Date()
  const rows = wanted.map(({ nodeId, kind }) => {
    const card = newCard(now)
    return { id: crypto.randomUUID(), node_id: nodeId, kind, card, due: card.due.toISOString() }
  })
  // ほかの端末で作っていたものは作らない（項目と種類ごとに1枚）
  const created = await run<CardRow[]>(
    supabase.from('cards').upsert(rows, { onConflict: 'node_id,kind', ignoreDuplicates: true }).select(CARD_COLUMNS),
  )
  notifyChange()
  return created.map(cardFromRow)
}

/** 復習の記録の ID を返す（取り消しに使う） */
export async function recordCardReview(card: NodeCard, grade: Grade, result: RecordLogItem): Promise<number> {
  await run(supabase.from('cards').update({ card: result.card, due: result.card.due.toISOString() }).eq('id', card.id))
  const log = await run<{ id: number }>(
    supabase
      .from('review_logs')
      .insert(
        logToRow({
          cardId: card.id,
          rating: grade,
          reviewedAt: result.log.review,
          scheduledDays: result.card.scheduled_days,
          log: result.log,
          cardBefore: card.card,
        }),
      )
      .select('id')
      .single(),
  )
  notifyChange()
  return log.id
}

/** 評価の取り消し：カードを評価する前に戻し、復習の記録も消す */
export async function undoCardReview(cardId: string, logId: number, cardBefore: Card) {
  await run(supabase.from('cards').update({ card: cardBefore, due: cardBefore.due.toISOString() }).eq('id', cardId))
  await run(supabase.from('review_logs').delete().eq('id', logId))
  notifyChange()
}
