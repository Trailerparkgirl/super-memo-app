import type { MapNode, MindMap } from './db'
import type { MapTree } from './tree'

/** AI に渡すマップの目次。ID は長いので n1, n2… の短い名前（ref）で渡す */
export interface Outline {
  lines: { ref: string; path: string }[]
  /** ref → 項目の ID */
  ids: Map<string, string>
}

/** 受信箱をのぞいた、すべてのマップの項目（exclude の項目は入れない） */
export function buildOutline(maps: MindMap[], tree: MapTree, exclude = new Set<string>()): Outline {
  const lines: Outline['lines'] = []
  const ids = new Map<string, string>()
  const visit = (node: MapNode, path: string) => {
    if (exclude.has(node.id)) return
    const ref = `n${lines.length + 1}`
    lines.push({ ref, path })
    ids.set(ref, node.id)
    for (const child of tree.children(node.id)) visit(child, `${path} › ${child.title}`)
  }
  for (const map of maps) {
    if (map.kind === 'inbox') continue
    const center = tree.center(map.id)
    if (center) visit(center, center.title)
  }
  return { lines, ids }
}
