import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { layoutMindMap, MAP_FONT_FAMILY, styleFor, type LayoutNode, type PlacedNode } from '../lib/radial'

/** マップに描く項目。color はその枝の色、memory はいま思い出せる確率（復習カードがなければ null） */
export interface CanvasNode extends LayoutNode {
  color: string
  memory: number | null
  children: CanvasNode[]
}

interface Props {
  root: CanvasNode
  selectedId: string | null
  /** 画面に入るように動かす項目（足したばかりの項目など）。値が変わったときだけ動かす */
  revealId: string | null
  showMemory: boolean
  /** 下のシートに隠れている高さ。全体表示や項目を見せるときに、ここを避ける */
  bottomInset: number
  /** 値が変わるたびに、マップ全体が画面に入るようにする */
  fitKey: number
  onSelect: (id: string | null) => void
  onToggle: (id: string) => void
}

// 文字の幅は、画面に描くのと同じフォントで測る
let context: CanvasRenderingContext2D | null = null
function measure(text: string, font: string): number {
  context ??= document.createElement('canvas').getContext('2d')
  if (!context) return text.length * 14
  context.font = font
  return context.measureText(text).width
}

const MIN_SCALE = 0.2
const MAX_SCALE = 2.5
// 開いたときと項目を見せるときは、スマホで文字が読める大きさにする
const READABLE_SCALE = 0.75
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function memoryColor(memory: number): string {
  if (memory >= 0.8) return '#10b981'
  if (memory >= 0.6) return '#f59e0b'
  return '#94a3b8'
}

/** テーマを中心に放射状に広がるマップ。1本指で動かし、2本指（PC はホイール）で拡大縮小する */
export function MindMapCanvas({ root, selectedId, revealId, showMemory, bottomInset, fitKey, onSelect, onToggle }: Props) {
  const layout = useMemo(() => layoutMindMap(root, measure), [root])
  const info = useMemo(() => {
    const map = new Map<string, CanvasNode>()
    const walk = (node: CanvasNode) => {
      map.set(node.id, node)
      node.children.forEach(walk)
    }
    walk(root)
    return map
  }, [root])

  const container = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  // 画面上の位置 = マップ上の位置 × scale + (x, y)
  const view = useRef({ x: 0, y: 0, scale: 1 })
  const ready = useRef(false)

  const apply = useCallback((animate = false) => {
    const el = world.current
    if (!el) return
    const { x, y, scale } = view.current
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.style.transition = animate && !reduce ? 'transform 250ms ease' : ''
    el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  }, [])

  /** マップ全体（大きすぎるときは中心のあたり）が画面に入るようにする */
  const fit = useCallback(
    (minScale: number, animate: boolean) => {
      const el = container.current
      if (!el) return
      const { minX, minY, maxX, maxY } = layout.bounds
      const pad = 24
      const width = el.clientWidth - pad * 2
      const height = el.clientHeight - bottomInset - pad * 2
      const fitted = Math.min(width / (maxX - minX), height / (maxY - minY), 1.2)
      const scale = clamp(fitted, minScale, MAX_SCALE)
      // 全体が入らないほど大きなマップは、中心のテーマを真ん中に置く
      const cx = fitted >= minScale ? (minX + maxX) / 2 : 0
      const cy = fitted >= minScale ? (minY + maxY) / 2 : 0
      view.current = { scale, x: el.clientWidth / 2 - cx * scale, y: (el.clientHeight - bottomInset) / 2 - cy * scale }
      apply(animate)
    },
    [layout, bottomInset, apply],
  )

  // はじめて開いたときと「全体」を押したとき
  useLayoutEffect(() => {
    if (!ready.current) {
      fit(READABLE_SCALE, false)
      ready.current = true
    } else fit(MIN_SCALE, true)
  }, [fitKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 足したばかりの項目などが画面の外なら、見えるところまで動かす。
  // 新しく見せる項目のときだけ文字が読める大きさにし、同じ項目のまま形が変わったときは大きさを変えない
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    const el = container.current
    const node = revealId ? layout.nodes.find((n) => n.id === revealId) : undefined
    if (!el || !node) return
    const isNew = revealed.current !== revealId
    revealed.current = revealId
    const { x, y } = view.current
    const scale = isNew ? Math.max(view.current.scale, READABLE_SCALE) : view.current.scale
    const left = node.x * scale + x
    const top = node.y * scale + y
    const right = left + node.width * scale
    const bottom = top + node.height * scale
    const margin = 32
    const visibleBottom = el.clientHeight - bottomInset
    if (scale === view.current.scale && left >= margin && right <= el.clientWidth - margin && top >= margin && bottom <= visibleBottom - margin) return
    view.current = {
      scale,
      x: el.clientWidth / 2 - (node.x + node.width / 2) * scale,
      y: visibleBottom / 2 - (node.y + node.height / 2) * scale,
    }
    apply(true)
  }, [revealId, layout, bottomInset, apply])

  // 指やマウスで動かす・拡大縮小する
  useEffect(() => {
    const el = container.current
    if (!el) return
    const pointers = new Map<number, { x: number; y: number }>()
    let start: { pointers: Map<number, { x: number; y: number }>; view: { x: number; y: number; scale: number } } | null = null
    let moved = false

    const begin = () => {
      start = { pointers: new Map(pointers), view: { ...view.current } }
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) moved = false
      begin()
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !start) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const [a, b] = [...pointers.values()]
      const [a0, b0] = [...start.pointers.values()]
      if (pointers.size === 1 && a0) {
        const dx = a.x - a0.x
        const dy = a.y - a0.y
        if (!moved && Math.hypot(dx, dy) < 6) return
        moved = true
        view.current = { ...start.view, x: start.view.x + dx, y: start.view.y + dy }
      } else if (a && b && a0 && b0) {
        moved = true
        const rect = el.getBoundingClientRect()
        const mid0 = { x: (a0.x + b0.x) / 2 - rect.left, y: (a0.y + b0.y) / 2 - rect.top }
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }
        const scale = clamp((start.view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / (Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1), MIN_SCALE, MAX_SCALE)
        // 指の間にあったマップ上の点が、指の間に残るように
        const wx = (mid0.x - start.view.x) / start.view.scale
        const wy = (mid0.y - start.view.y) / start.view.scale
        view.current = { scale, x: mid.x - wx * scale, y: mid.y - wy * scale }
      }
      apply()
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size === 0) {
        start = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      } else begin()
    }
    // 動かしたあとに指を離しても、項目を押したことにしない
    const onClick = (e: MouseEvent) => {
      if (!moved) return
      e.stopPropagation()
      e.preventDefault()
      moved = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const { x, y, scale } = view.current
      const next = clamp(scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), MIN_SCALE, MAX_SCALE)
      view.current = { scale: next, x: px - ((px - x) / scale) * next, y: py - ((py - y) / scale) * next }
      apply()
    }
    // iPhone の Safari が画面全体を拡大しないように
    const stop = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('click', onClick, true)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', stop)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', stop)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [apply])

  return (
    <div
      ref={container}
      className="relative h-full w-full touch-none overflow-hidden select-none"
      style={{ backgroundImage: 'radial-gradient(rgb(148 163 184 / 0.35) 1px, transparent 1.2px)', backgroundSize: '18px 18px' }}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) onSelect(null)
      }}
    >
      <div ref={world} className="absolute top-0 left-0 origin-top-left">
        <svg className="absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
          {layout.edges.map((edge) => {
            const color = info.get(edge.to)?.color ?? '#6366f1'
            return edge.filled ? (
              <path key={edge.to} d={edge.d} fill={color} fillOpacity={edge.ghost ? 0.45 : 1} />
            ) : (
              <path
                key={edge.to}
                d={edge.d}
                fill="none"
                stroke={color}
                strokeWidth={edge.width}
                strokeLinecap="round"
                strokeDasharray={edge.ghost ? '4 4' : undefined}
                strokeOpacity={edge.ghost ? 0.7 : 1}
              />
            )
          })}
        </svg>
        {layout.nodes.map((node) => (
          <MapItem
            key={node.id}
            node={node}
            color={info.get(node.id)?.color ?? '#6366f1'}
            memory={showMemory ? (info.get(node.id)?.memory ?? null) : null}
            selected={node.id === selectedId}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

function MapItem({
  node,
  color,
  memory,
  selected,
  onSelect,
  onToggle,
}: {
  node: PlacedNode
  color: string
  memory: number | null
  selected: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}) {
  const style = styleFor(node.depth)
  const shape =
    node.depth === 0
      ? 'rounded-2xl bg-slate-900 text-white shadow-lg dark:bg-white dark:text-slate-900'
      : node.depth === 1
        ? `rounded-full shadow-sm ${node.ghost ? 'bg-white/80 dark:bg-slate-900/80' : 'text-white'}`
        : `rounded-md ${node.ghost ? 'bg-white/80 dark:bg-slate-900/80' : ''}`
  return (
    <>
      <button
        type="button"
        aria-pressed={selected}
        title={node.lines.join('')}
        onClick={() => onSelect(node.id)}
        className={`absolute top-0 left-0 text-left ${shape} ${node.ghost || node.depth < 2 ? '' : 'text-slate-800 dark:text-slate-100'}`}
        style={{
          transform: `translate(${node.x}px, ${node.y}px)`,
          width: node.width,
          height: node.height,
          padding: `${style.padY}px ${style.padX}px`,
          font: style.font,
          lineHeight: `${style.lineHeight}px`,
          fontFamily: MAP_FONT_FAMILY,
          background: node.depth === 1 && !node.ghost ? color : undefined,
          color: node.ghost ? color : undefined,
          outline: selected ? `2.5px solid ${node.depth === 0 ? '#6366f1' : color}` : undefined,
          outlineOffset: 3,
          opacity: memory !== null && memory < 0.6 ? 0.55 : 1,
        }}
      >
        {node.lines.map((line, i) => (
          <span key={i} className="block whitespace-pre">
            {line}
          </span>
        ))}
        {node.depth >= 2 && !node.ghost && <span className="absolute inset-x-0 bottom-0 h-[2.5px] rounded-full" style={{ background: color }} />}
        {node.ghost && (
          <>
            <span
              className={`pointer-events-none absolute inset-0 border-[1.5px] border-dashed ${node.depth === 1 ? 'rounded-full' : 'rounded-md'}`}
              style={{ borderColor: color }}
            />
            <span className="absolute -top-2 -right-2 rounded bg-indigo-600 px-1 text-[9px] leading-[14px] font-bold text-white">AI</span>
          </>
        )}
        {memory !== null && (
          <span className="absolute -top-1 -right-1 size-2.5 rounded-full ring-2 ring-slate-100 dark:ring-slate-950" style={{ background: memoryColor(memory) }} />
        )}
      </button>
      {node.hidden > 0 && (
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className="absolute top-0 left-0 rounded-full border bg-white px-1.5 text-[11px] leading-[18px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300"
          style={{
            borderColor: color,
            transform: `translate(${node.side === -1 ? node.x - 30 : node.x + node.width + 6}px, ${node.y + node.height / 2 - 10}px)`,
          }}
        >
          +{node.hidden}
        </button>
      )}
    </>
  )
}
