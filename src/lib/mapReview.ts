import type { MapNode, NodeCard } from './db'
import type { Library } from './maps'
import { endOfDay } from './scheduler'
import { buildTree } from './tree'

export interface ReviewItem {
  card: NodeCard
  node: MapNode
  /** 中心からその項目まで（中心のテーマと項目を含む） */
  path: string[]
  children: { title: string; color: string }[]
  color: string
}

/**
 * 今日までに復習するマップのカード（予定日の早い順）。mapId を指定すると、そのマップだけ。
 * 定義が空になった「定義」カードと、枝が2つ未満になった「枝」カードは出さない（また条件を満たせば出てくる）
 */
export function dueReviewItems(library: Library, inboxTitle: string, now = new Date(), mapId?: string): ReviewItem[] {
  const tree = buildTree(library.nodes)
  const inboxes = new Set(library.maps.filter((m) => m.kind === 'inbox').map((m) => m.id))
  const end = endOfDay(now).getTime()
  return library.cards
    .filter((c) => c.due <= end)
    .flatMap((card): ReviewItem[] => {
      const node = tree.byId.get(card.nodeId)
      if (!node || (mapId && node.mapId !== mapId)) return []
      const children = tree.children(node.id)
      if (card.kind === 'explain' ? !node.definition.trim() : children.length < 2) return []
      const path = tree.path(node.id).map((n) => (n.parentId === null && inboxes.has(n.mapId) ? inboxTitle : n.title))
      return [{ card, node, path, children: children.map((c) => ({ title: c.title, color: tree.color(c.id) })), color: tree.color(node.id) }]
    })
    .sort((a, b) => a.card.due - b.card.due || a.card.id.localeCompare(b.card.id))
}
