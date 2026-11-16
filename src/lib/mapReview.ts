import type { CanvasNode } from '../components/MindMapCanvas'
import type { MapNode, NodeCard } from './db'
import type { Library } from './maps'
import { endOfDay } from './scheduler'
import { buildTree, type MapTree } from './tree'

export interface ReviewItem {
  card: NodeCard
  node: MapNode
  /** 中心からその項目まで（中心のテーマと項目を含む） */
  path: string[]
  children: { title: string; color: string }[]
  color: string
  /** 「マップ」カードのとき、復習で見せるマップ全体（定義は出さない） */
  map: CanvasNode | null
}

/**
 * 今日までに復習するカード（予定日の早い順）。mapId を指定すると、そのマップだけ。
 * マップはマップ全体の「マップ」カード、受信箱は項目ごとの「定義」カードで復習する。
 * 枝がなくなったマップと、定義が空になった項目は出さない（また条件を満たせば出てくる）
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
      const isInbox = inboxes.has(node.mapId)
      if (isInbox ? card.kind !== 'explain' || !node.definition.trim() : card.kind !== 'map' || children.length === 0) return []
      const path = tree.path(node.id).map((n) => (n.parentId === null && isInbox ? inboxTitle : n.title))
      return [
        {
          card,
          node,
          path,
          children: children.map((c) => ({ title: c.title, color: tree.color(c.id) })),
          color: tree.color(node.id),
          map: card.kind === 'map' ? canvasTree(tree, node) : null,
        },
      ]
    })
    .sort((a, b) => a.card.due - b.card.due || a.card.id.localeCompare(b.card.id))
}

/** マップに描く形（見た目と、手で動かした位置も含む） */
function canvasTree(tree: MapTree, node: MapNode): CanvasNode {
  return {
    id: node.id,
    title: node.title,
    color: node.parentId === null ? '#6366f1' : tree.color(node.id),
    memory: null,
    shape: node.shape,
    offset: node.offsetX !== null && node.offsetY !== null ? { x: node.offsetX, y: node.offsetY } : null,
    children: tree.children(node.id).map((c) => canvasTree(tree, c)),
  }
}
