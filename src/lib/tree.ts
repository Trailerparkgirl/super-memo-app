import { branchHex } from './branchColors'
import type { MapNode } from './db'

/** マップの項目を木としてたどるための索引（いくつものマップの項目をまとめて渡してもいい） */
export interface MapTree {
  byId: Map<string, MapNode>
  /** 子の項目（順番どおり） */
  children(id: string): MapNode[]
  /** マップの中心（テーマ） */
  center(mapId: string): MapNode | undefined
  /** 中心からその項目までの道のり（その項目も含む） */
  path(id: string): MapNode[]
  /** 中心が 0、テーマのすぐ外の枝が 1 */
  depth(id: string): number
  /** その項目がある枝の色 */
  color(id: string): string
  /** その項目より先の、すべての項目の ID */
  descendants(id: string): string[]
}

const byPosition = (a: MapNode, b: MapNode) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime()

export function buildTree(nodes: MapNode[]): MapTree {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kids = new Map<string, MapNode[]>()
  const centers = new Map<string, MapNode>()
  for (const node of nodes) {
    if (node.parentId === null) centers.set(node.mapId, node)
    else kids.set(node.parentId, [...(kids.get(node.parentId) ?? []), node])
  }
  for (const list of kids.values()) list.sort(byPosition)

  const children = (id: string) => kids.get(id) ?? []

  function path(id: string): MapNode[] {
    const result: MapNode[] = []
    for (let node = byId.get(id); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
      result.unshift(node)
      // 壊れたデータで親をたどり続けないように
      if (result.length > 1000) break
    }
    return result
  }

  return {
    byId,
    children,
    center: (mapId) => centers.get(mapId),
    path,
    depth: (id) => path(id).length - 1,
    color(id) {
      const [center, branch] = path(id)
      if (!branch) return branchHex(null)
      return branchHex(branch.color, center ? children(center.id).indexOf(branch) : 0)
    },
    descendants(id) {
      const result: string[] = []
      const stack = [...children(id)]
      while (stack.length) {
        const node = stack.pop()!
        result.push(node.id)
        stack.push(...children(node.id))
      }
      return result
    },
  }
}

/** 兄弟の最後に足すときの順番 */
export function nextPosition(siblings: MapNode[]): number {
  return siblings.reduce((max, n) => Math.max(max, n.position), 0) + 1
}
