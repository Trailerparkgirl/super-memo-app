// ---- マインドマップの配置 ----
// 中心のテーマから放射状に枝を出す。テーマのすぐ外の枝を左右に分け（右は上から下へ、左は下から上へ。時計回りに並ぶ）、
// その先は外へ向かって伸ばす。位置は毎回ここで決めるので、データベースには保存しない。
// 文字の幅は画面と同じフォントで測る（measure）ので、項目どうしは重ならない。

export interface LayoutNode {
  id: string
  title: string
  children: LayoutNode[]
  /** AI の提案（まだマップに入れていない） */
  ghost?: boolean
  /** 枝をたたんでいる（子は配置しない） */
  collapsed?: boolean
}

export interface PlacedNode {
  id: string
  parentId: string | null
  /** 中心が 0、テーマのすぐ外の枝が 1 */
  depth: number
  /** 1: 右へ伸びる / -1: 左へ伸びる / 0: 中心 */
  side: -1 | 0 | 1
  /** 左上の位置（中心のテーマの真ん中が原点） */
  x: number
  y: number
  width: number
  height: number
  lines: string[]
  ghost: boolean
  /** たたんでいる子の数 */
  hidden: number
}

export interface PlacedEdge {
  from: string
  to: string
  /** SVG の path。テーマから出る枝は根元が太い形（塗りつぶす）、その先は線（stroke） */
  d: string
  filled: boolean
  width: number
  ghost: boolean
}

export interface MapLayout {
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

/** text を font で書いたときの幅（px） */
export type Measure = (text: string, font: string) => number

export const MAP_FONT_FAMILY = `system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif`

/** 深さごとの見た目。中心 / テーマのすぐ外（塗った札） / その先（下線） */
export const NODE_STYLES = [
  { font: `700 18px ${MAP_FONT_FAMILY}`, fontSize: 18, weight: 700, lineHeight: 24, padX: 18, padY: 12, maxWidth: 200 },
  { font: `600 15px ${MAP_FONT_FAMILY}`, fontSize: 15, weight: 600, lineHeight: 20, padX: 14, padY: 8, maxWidth: 180 },
  { font: `500 14px ${MAP_FONT_FAMILY}`, fontSize: 14, weight: 500, lineHeight: 19, padX: 4, padY: 4, maxWidth: 168 },
] as const

export const styleFor = (depth: number) => NODE_STYLES[Math.min(depth, 2)]

/** 兄弟の間のすき間（縦）と、親から子までの距離（横）。添え字は子の深さ */
const V_GAP = [0, 22, 10, 6]
const H_GAP = [0, 64, 30, 24]
const gapAt = (gaps: number[], depth: number) => gaps[Math.min(depth, gaps.length - 1)]

// 行頭に来ると読みにくい文字（前の行の終わりにはみ出して置く）
const NO_LINE_START = /^[、。，．,.)）」』】〉》!?！？ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/
// 英数字の語はまとめて、それ以外（日本語など）は1文字ずつ折り返せる
const TOKEN = /[\p{Script=Latin}\p{N}_\-./:@#%&+=?!'"()[\]{}<>*]+\s*|\s+|./gsu
const MAX_LINES = 3

/** 最大 maxWidth の幅に折り返す（3行まで。あふれたら … で終える） */
export function wrapText(text: string, maxWidth: number, width: (s: string) => number): string[] {
  const lines: string[] = []
  let line = ''
  for (const token of text.replace(/\s+/g, ' ').trim().match(TOKEN) ?? []) {
    if (line && (width((line + token).trimEnd()) <= maxWidth || NO_LINE_START.test(token))) {
      line += token
      continue
    }
    if (line) lines.push(line.trimEnd())
    line = token.trimStart()
    // 1語だけで幅を超える長い語（URL など）は文字の途中で折る
    while (width(line.trimEnd()) > maxWidth && line.length > 1) {
      let cut = line.length - 1
      while (cut > 1 && width(line.slice(0, cut)) > maxWidth) cut--
      lines.push(line.slice(0, cut))
      line = line.slice(cut)
    }
  }
  if (line.trim()) lines.push(line.trimEnd())
  if (lines.length <= MAX_LINES) return lines.length ? lines : ['']
  const kept = lines.slice(0, MAX_LINES)
  let last = kept[MAX_LINES - 1]
  while (last.length > 1 && width(last + '…') > maxWidth) last = last.slice(0, -1)
  kept[MAX_LINES - 1] = last + '…'
  return kept
}

interface Sized {
  node: LayoutNode
  depth: number
  width: number
  height: number
  lines: string[]
  kids: Sized[]
  /** その項目と子孫が縦に使う高さ */
  span: number
}

function size(node: LayoutNode, depth: number, measure: Measure): Sized {
  const style = styleFor(depth)
  const lines = wrapText(node.title, style.maxWidth, (s) => measure(s, style.font))
  const textWidth = Math.max(...lines.map((l) => measure(l, style.font)))
  const width = Math.ceil(Math.max(textWidth, depth === 0 ? 48 : 16)) + style.padX * 2 + 2
  const height = lines.length * style.lineHeight + style.padY * 2
  const kids = node.collapsed ? [] : node.children.map((c) => size(c, depth + 1, measure))
  const gap = gapAt(V_GAP, depth + 1)
  const block = kids.reduce((sum, k) => sum + k.span, 0) + gap * Math.max(0, kids.length - 1)
  return { node, depth, width, height, lines, kids, span: Math.max(height, block) }
}

/** 3次ベジェ曲線の点 */
function bezier(p: number[][], t: number): number[] {
  const u = 1 - t
  return [0, 1].map((i) => u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i])
}

/** 根元が太く先が細い枝の形（ベジェ曲線の両側に幅をつけた多角形） */
function taperedPath(p: number[][], startWidth: number, endWidth: number): string {
  const steps = 24
  const points = Array.from({ length: steps + 1 }, (_, i) => bezier(p, i / steps))
  const left: string[] = []
  const right: string[] = []
  points.forEach((pt, i) => {
    const a = points[Math.max(0, i - 1)]
    const b = points[Math.min(steps, i + 1)]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const half = (startWidth + (endWidth - startWidth) * (i / steps)) / 2
    const nx = (-(b[1] - a[1]) / len) * half
    const ny = ((b[0] - a[0]) / len) * half
    left.push(`${(pt[0] + nx).toFixed(1)} ${(pt[1] + ny).toFixed(1)}`)
    right.unshift(`${(pt[0] - nx).toFixed(1)} ${(pt[1] - ny).toFixed(1)}`)
  })
  return `M${left.join(' L')} L${right.join(' L')} Z`
}

const curve = (p: number[][]) => `M${p[0].join(' ')} C${p[1].join(' ')} ${p[2].join(' ')} ${p[3].join(' ')}`

export function layoutMindMap(root: LayoutNode, measure: Measure): MapLayout {
  const tree = size(root, 0, measure)
  const nodes: PlacedNode[] = []
  const edges: PlacedEdge[] = []

  const center: PlacedNode = {
    id: root.id,
    parentId: null,
    depth: 0,
    side: 0,
    x: -tree.width / 2,
    y: -tree.height / 2,
    width: tree.width,
    height: tree.height,
    lines: tree.lines,
    ghost: !!root.ghost,
    hidden: root.collapsed ? root.children.length : 0,
  }
  nodes.push(center)

  /** 項目を置き、その子を外側へ縦に並べる。innerX は親に近い側の端 */
  function place(item: Sized, parent: PlacedNode, side: 1 | -1, innerX: number, centerY: number): PlacedNode {
    const placed: PlacedNode = {
      id: item.node.id,
      parentId: parent.id,
      depth: item.depth,
      side,
      x: side === 1 ? innerX : innerX - item.width,
      y: centerY - item.height / 2,
      width: item.width,
      height: item.height,
      lines: item.lines,
      ghost: !!item.node.ghost,
      hidden: item.node.collapsed ? item.node.children.length : 0,
    }
    nodes.push(placed)
    edges.push(edge(parent, placed, side))

    const gap = gapAt(V_GAP, item.depth + 1)
    const block = item.kids.reduce((sum, k) => sum + k.span, 0) + gap * Math.max(0, item.kids.length - 1)
    let top = centerY - block / 2
    const outerX = side === 1 ? placed.x + placed.width : placed.x
    for (const kid of item.kids) {
      place(kid, placed, side, outerX + side * gapAt(H_GAP, kid.depth), top + kid.span / 2)
      top += kid.span + gap
    }
    return placed
  }

  /** 親の外側の端から、子の内側の端へ。下線の項目は下線の高さでつなぐ */
  function edge(parent: PlacedNode, child: PlacedNode, side: 1 | -1): PlacedEdge {
    const ghost = child.ghost
    if (parent.depth === 0) {
      const end = [side === 1 ? child.x : child.x + child.width, child.y + child.height / 2]
      const dx = end[0]
      const p = [[0, 0], [dx * 0.55, 0], [dx * 0.6, end[1]], end]
      return { from: parent.id, to: child.id, d: taperedPath(p, ghost ? 3 : 9, ghost ? 2 : 3.5), filled: true, width: 0, ghost }
    }
    const start = [side === 1 ? parent.x + parent.width : parent.x, parent.depth === 1 ? parent.y + parent.height / 2 : parent.y + parent.height]
    const end = [side === 1 ? child.x : child.x + child.width, child.y + child.height]
    const bend = (end[0] - start[0]) * 0.55
    const p = [start, [start[0] + bend, start[1]], [end[0] - bend * 0.6, end[1]], end]
    return { from: parent.id, to: child.id, d: curve(p.map((pt) => pt.map((v) => +v.toFixed(1)))), filled: false, width: child.depth === 2 ? 2.5 : 2, ghost }
  }

  // テーマのすぐ外の枝を、縦の長さが半分ずつになるように右と左へ分ける
  const total = tree.kids.reduce((sum, k) => sum + k.span, 0)
  const right: Sized[] = []
  const left: Sized[] = []
  let used = 0
  for (const kid of tree.kids) {
    if (right.length === 0 || (used + kid.span / 2 <= total / 2 && left.length === 0)) {
      right.push(kid)
      used += kid.span
    } else left.push(kid)
  }
  // 左は下から上へ並べると、右の上から時計回りに一周する
  left.reverse()

  const gap = gapAt(V_GAP, 1)
  for (const [group, side] of [
    [right, 1],
    [left, -1],
  ] as const) {
    const block = group.reduce((sum, k) => sum + k.span, 0) + gap * Math.max(0, group.length - 1)
    let top = -block / 2
    for (const kid of group) {
      place(kid, center, side, side * (tree.width / 2 + gapAt(H_GAP, 1)), top + kid.span / 2)
      top += kid.span + gap
    }
  }

  const bounds = {
    minX: Math.min(...nodes.map((n) => n.x)),
    minY: Math.min(...nodes.map((n) => n.y)),
    maxX: Math.max(...nodes.map((n) => n.x + n.width)),
    maxY: Math.max(...nodes.map((n) => n.y + n.height)),
  }
  return { nodes, edges, bounds }
}
