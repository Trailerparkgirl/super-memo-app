import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MindMapCanvas, type CanvasNode } from '../components/MindMapCanvas'
import { MovePicker } from '../components/MovePicker'
import { useI18n } from '../i18n'
import { aiErrorMessage, suggestBranches, writeDefinition } from '../lib/ai'
import { BRANCH_COLOR_KEYS, BRANCH_COLORS, nextBranchColor, type BranchColor } from '../lib/branchColors'
import type { MapNode, MindMap, NodeCard } from '../lib/db'
import { createMissingCards, deleteMap, deleteNode, insertNodes, loadMap, moveNode, updateNode } from '../lib/maps'
import { daysUntil, retrievability } from '../lib/scheduler'
import { load, save } from '../lib/storage'
import { buildTree, nextPosition } from '../lib/tree'
import { useNow } from '../lib/useNow'

interface MapData {
  map: MindMap
  nodes: MapNode[]
  cards: NodeCard[]
}

// AI の提案の項目は、ID の代わりにこれを頭につけた名前で描く
const GHOST = 'ghost:'
// 「記憶」の表示をこの端末で覚えておく
const MEMORY_KEY = 'super-memo:map-memory'

export function MapPage() {
  const { id = '' } = useParams()
  // 読み込み中は undefined、ないマップは null
  const [data, setData] = useState<MapData | null>()
  const [error, setError] = useState<unknown>()
  useEffect(() => {
    let cancelled = false
    loadMap(id).then(
      (loaded) => !cancelled && setData(loaded),
      (e: unknown) => !cancelled && setError(e),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) throw error
  if (data === undefined) return null
  if (data === null) return <NotFound />
  return <MapEditor key={id} initial={data} />
}

function NotFound() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-slate-600 dark:text-slate-300">{t.map.notFound}</p>
      <Link to="/maps" className="rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white">
        {t.map.back}
      </Link>
    </div>
  )
}

interface Suggestions {
  forId: string
  status: 'loading' | 'ready' | 'error'
  titles: string[]
  error: string
}

function MapEditor({ initial }: { initial: MapData }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { map } = initial
  const isInbox = map.kind === 'inbox'

  const [nodes, setNodes] = useState(initial.nodes)
  const [cards, setCards] = useState(initial.cards)
  // 非同期の処理のあとでも、いちばん新しい項目とカードを使う
  const latest = useRef({ nodes, cards })
  latest.current = { nodes, cards }

  // 新しいマップを作った直後（?suggest=1）は、テーマを選んだ状態で、テーマから伸ばす枝を AI が提案する
  const [initialCenter] = useState(() => (params.get('suggest') === '1' ? initial.nodes.find((n) => n.parentId === null) : undefined))
  const [selectedId, setSelectedId] = useState<string | null>(() => initialCenter?.id ?? params.get('node'))
  const [revealId, setRevealId] = useState<string | null>(() => params.get('node'))
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [showMemory, setShowMemory] = useState(() => load(MEMORY_KEY) === '1')
  const [fitKey, setFitKey] = useState(0)
  const [suggestions, setSuggestions] = useState<Suggestions | null>(() =>
    initialCenter ? { forId: initialCenter.id, status: 'loading', titles: [], error: '' } : null,
  )
  const [moving, setMoving] = useState<MapNode | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(0)
  const sheet = useRef<HTMLDivElement>(null)
  const request = useRef(0)

  const tree = useMemo(() => buildTree(nodes), [nodes])
  const center = tree.center(map.id)
  const selected = selectedId ? tree.byId.get(selectedId) : undefined
  const titleOf = (node: MapNode) => (isInbox && node.parentId === null ? t.maps.inbox : node.title)

  // 下のシートの高さを、マップの表示（全体表示や項目を見せる位置）に伝える
  useEffect(() => {
    const el = sheet.current
    if (!el) return
    const observer = new ResizeObserver(() => setSheetHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ---- 書き込み（画面はすぐに変え、保存に失敗したら知らせて読み直す） ----

  async function write(task: () => Promise<unknown>): Promise<boolean> {
    try {
      await task()
      return true
    } catch (e) {
      console.error(e)
      alert(t.common.saveFailed)
      const fresh = await loadMap(map.id).catch(() => null)
      if (fresh) {
        setLatestNodes(fresh.nodes)
        setCards(fresh.cards)
      }
      return false
    }
  }

  /** 定義のある項目・枝が2つ以上の項目に、まだない復習カードを作る */
  async function syncCards() {
    try {
      const created = await createMissingCards(latest.current.nodes, latest.current.cards, isInbox)
      if (created.length) setCards((list) => [...list, ...created])
    } catch (e) {
      // 次に項目を変えたときにもう一度作る
      console.error(e)
    }
  }

  function setLatestNodes(next: MapNode[]) {
    latest.current.nodes = next
    setNodes(next)
  }

  /** parent から枝を伸ばす。テーマから伸ばす枝には、まだ使っていない色をつける */
  async function addChildren(parent: MapNode, titles: string[], suggestAfter: boolean) {
    const siblings = buildTree(latest.current.nodes).children(parent.id)
    const usedColors = siblings.map((s) => s.color)
    const now = new Date()
    const added = titles.map((title, i): MapNode => {
      const color = parent.parentId === null && !isInbox ? nextBranchColor(usedColors) : null
      usedColors.push(color)
      return {
        id: crypto.randomUUID(),
        mapId: map.id,
        parentId: parent.id,
        position: nextPosition(siblings) + i,
        title,
        definition: '',
        color,
        createdAt: now,
        updatedAt: now,
      }
    })
    setLatestNodes([...latest.current.nodes, ...added])
    setCollapsed((set) => new Set([...set].filter((id) => id !== parent.id)))
    setRevealId(added[added.length - 1].id)
    if (!(await write(() => insertNodes(added)))) return
    await syncCards()
    // 入力した項目には、そこから伸ばせる枝を AI が提案する
    if (suggestAfter && added.length === 1) requestSuggestions(added[0])
  }

  function requestSuggestions(node: MapNode) {
    setSuggestions({ forId: node.id, status: 'loading', titles: [], error: '' })
    setCollapsed((set) => new Set([...set].filter((id) => id !== node.id)))
    fetchSuggestions(node, ++request.current)
  }

  /** AI に枝の候補を聞く。token が変わっていたら（別の項目を聞き直したら）結果は使わない */
  async function fetchSuggestions(node: MapNode, token: number) {
    try {
      const current = buildTree(latest.current.nodes)
      const titles = await suggestBranches(
        lang,
        current.path(node.id).map(titleOf),
        node.definition,
        current.children(node.id).map((n) => n.title),
      )
      if (token !== request.current) return
      setSuggestions({ forId: node.id, status: 'ready', titles, error: titles.length ? '' : t.map.noSuggestions })
    } catch (e) {
      console.error(e)
      if (token === request.current) setSuggestions({ forId: node.id, status: 'error', titles: [], error: aiErrorMessage(e, t) })
    }
  }

  function acceptSuggestions(titles: string[]) {
    const parent = suggestions && tree.byId.get(suggestions.forId)
    if (!parent || titles.length === 0) return
    setSuggestions((s) => (s ? { ...s, titles: s.titles.filter((title) => !titles.includes(title)) } : s))
    addChildren(parent, titles, false)
  }

  function changeNode(id: string, patch: Partial<Pick<MapNode, 'title' | 'definition' | 'color'>>) {
    setLatestNodes(latest.current.nodes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date() } : n)))
    write(async () => {
      await updateNode(id, patch)
      if (patch.definition !== undefined) await syncCards()
    })
  }

  function remove(node: MapNode) {
    const branch = new Set([node.id, ...tree.descendants(node.id)])
    if (!confirm(t.map.confirmDelete(node.title, branch.size - 1))) return
    setLatestNodes(latest.current.nodes.filter((n) => !branch.has(n.id)))
    setCards((list) => list.filter((c) => !branch.has(c.nodeId)))
    setSelectedId(node.parentId)
    write(() => deleteNode(node.id))
  }

  async function moveTo(node: MapNode, parent: MapNode) {
    setMoving(null)
    if (parent.id === node.parentId) return
    if (parent.mapId === map.id) {
      const position = nextPosition(tree.children(parent.id))
      setLatestNodes(latest.current.nodes.map((n) => (n.id === node.id ? { ...n, parentId: parent.id, position } : n)))
      setRevealId(node.id)
      if (await write(() => moveNode(node.id, parent.id, position))) await syncCards()
      return
    }
    // ほかのマップへ移したら、この画面からは消える。移した先でもカードを作っておく
    const branch = new Set([node.id, ...tree.descendants(node.id)])
    setLatestNodes(latest.current.nodes.filter((n) => !branch.has(n.id)))
    setCards((list) => list.filter((c) => !branch.has(c.nodeId)))
    setSelectedId(null)
    await write(async () => {
      await moveNode(node.id, parent.id, Date.now() / 1000)
      const target = await loadMap(parent.mapId)
      if (target) await createMissingCards(target.nodes, target.cards, target.map.kind === 'inbox')
    })
  }

  async function removeMap() {
    setMenuOpen(false)
    if (!center || !confirm(t.map.confirmDeleteMap(center.title))) return
    await write(() => deleteMap(map.id))
    navigate('/maps', { replace: true })
  }

  useEffect(() => {
    if (!initialCenter) return
    fetchSuggestions(initialCenter, ++request.current)
    setParams({}, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- マップに描くもの ----

  const now = useNow()
  const canvasRoot = useMemo(() => {
    if (!center) return null
    const memoryOf = (id: string) => {
      const values = cards.filter((c) => c.nodeId === id).flatMap((c) => retrievability(c.card, now) ?? [])
      return values.length ? Math.min(...values) : null
    }
    const build = (node: MapNode): CanvasNode => {
      const children = tree.children(node.id).map(build)
      if (suggestions?.status === 'ready' && suggestions.forId === node.id) {
        const used: (string | null)[] = tree.children(node.id).map((c) => c.color)
        for (const title of suggestions.titles) {
          let color = tree.color(node.id)
          if (node.parentId === null) {
            const key = nextBranchColor(used)
            used.push(key)
            color = BRANCH_COLORS[key]
          }
          children.push({ id: GHOST + title, title, ghost: true, color, memory: null, children: [] })
        }
      }
      return {
        id: node.id,
        title: titleOf(node),
        color: node.parentId === null ? '#6366f1' : tree.color(node.id),
        memory: memoryOf(node.id),
        collapsed: collapsed.has(node.id),
        children,
      }
    }
    return build(center)
  }, [center, tree, cards, suggestions, collapsed, now]) // eslint-disable-line react-hooks/exhaustive-deps

  function select(id: string | null) {
    if (id?.startsWith(GHOST)) return acceptSuggestions([id.slice(GHOST.length)])
    setSelectedId(id)
    setMenuOpen(false)
  }

  function toggleMemory() {
    setShowMemory((on) => {
      save(MEMORY_KEY, on ? null : '1')
      return !on
    })
  }

  const headerButton = 'rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold shadow-sm dark:bg-slate-900/90'
  const viewportHeight = useViewportHeight()

  return (
    <div className="fixed inset-x-0 top-0 z-20 flex h-dvh flex-col bg-slate-100 dark:bg-slate-950" style={{ height: viewportHeight }}>
      <header className="relative z-10 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Link to="/maps" className={`${headerButton} text-slate-600 dark:text-slate-300`}>
          {t.map.back}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center font-bold">{center ? titleOf(center) : ''}</h1>
        <button onClick={toggleMemory} aria-pressed={showMemory} className={`${headerButton} ${showMemory ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
          {t.map.memory}
        </button>
        <button onClick={() => setFitKey((k) => k + 1)} className={`${headerButton} text-slate-600 dark:text-slate-300`}>
          {t.map.fit}
        </button>
        {!isInbox && (
          <div className="relative">
            <button onClick={() => setMenuOpen((open) => !open)} aria-label={t.map.deleteMap} className={`${headerButton} text-slate-600 dark:text-slate-300`}>
              •••
            </button>
            {menuOpen && (
              <div className="absolute top-full right-0 mt-2 w-44 rounded-xl bg-white p-1 shadow-lg dark:bg-slate-800">
                <button onClick={removeMap} className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950">
                  {t.map.deleteMap}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="relative flex-1 overflow-hidden">
        {canvasRoot && (
          <MindMapCanvas
            root={canvasRoot}
            selectedId={selectedId}
            revealId={revealId}
            showMemory={showMemory}
            bottomInset={sheetHeight}
            fitKey={fitKey}
            onSelect={select}
            onToggle={(id) =>
              setCollapsed((set) => {
                const next = new Set(set)
                if (!next.delete(id)) next.add(id)
                return next
              })
            }
          />
        )}

        <div ref={sheet} className="absolute inset-x-0 bottom-0 mx-auto max-w-xl">
          {suggestions && (
            <SuggestionBar
              title={tree.byId.get(suggestions.forId)?.title ?? ''}
              suggestions={suggestions}
              onAddAll={() => acceptSuggestions(suggestions.titles)}
              onDismiss={() => {
                request.current++
                setSuggestions(null)
              }}
            />
          )}
          {selected ? (
            <NodeSheet
              key={selected.id}
              node={selected}
              path={tree.path(selected.id).map(titleOf)}
              depth={tree.depth(selected.id)}
              childCount={tree.children(selected.id).length}
              cards={cards.filter((c) => c.nodeId === selected.id)}
              isInbox={isInbox}
              collapsed={collapsed.has(selected.id)}
              siblings={selected.parentId ? tree.children(selected.parentId).filter((n) => n.id !== selected.id).map((n) => n.title) : []}
              childTitles={tree.children(selected.id).map((n) => n.title)}
              onChange={(patch) => changeNode(selected.id, patch)}
              onAdd={(title) => addChildren(selected, [title], true)}
              onSuggest={() => requestSuggestions(selected)}
              onMove={() => setMoving(selected)}
              onDelete={() => remove(selected)}
              onToggle={() =>
                setCollapsed((set) => {
                  const next = new Set(set)
                  if (!next.delete(selected.id)) next.add(selected.id)
                  return next
                })
              }
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <p className="m-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-2xl bg-white/90 px-4 py-3 text-center text-sm text-slate-500 shadow-sm dark:bg-slate-900/90 dark:text-slate-400">
              {t.map.tapHint}
            </p>
          )}
        </div>
      </div>

      {moving && (
        <MovePicker
          node={moving}
          exclude={new Set([moving.id, ...tree.descendants(moving.id)])}
          onMove={(parent) => moveTo(moving, parent)}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  )
}

function SuggestionBar({ title, suggestions, onAddAll, onDismiss }: { title: string; suggestions: Suggestions; onAddAll: () => void; onDismiss: () => void }) {
  const { t } = useI18n()
  const message =
    suggestions.status === 'loading' ? t.map.suggesting(title) : suggestions.error || t.map.suggestions(title)
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-lg">
      {suggestions.status === 'loading' && <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      <p className="min-w-0 flex-1 leading-snug">{message}</p>
      {suggestions.status === 'ready' && suggestions.titles.length > 1 && (
        <button onClick={onAddAll} className="shrink-0 rounded-full bg-white/20 px-3 py-1 font-semibold">
          {t.map.addAll}
        </button>
      )}
      <button onClick={onDismiss} aria-label={t.map.dismiss} className="shrink-0 px-1 text-lg leading-none opacity-80">
        ✕
      </button>
    </div>
  )
}

function NodeSheet({
  node,
  path,
  depth,
  childCount,
  cards,
  isInbox,
  collapsed,
  siblings,
  childTitles,
  onChange,
  onAdd,
  onSuggest,
  onMove,
  onDelete,
  onToggle,
  onClose,
}: {
  node: MapNode
  path: string[]
  depth: number
  childCount: number
  cards: NodeCard[]
  isInbox: boolean
  collapsed: boolean
  siblings: string[]
  childTitles: string[]
  onChange: (patch: Partial<Pick<MapNode, 'title' | 'definition' | 'color'>>) => void
  onAdd: (title: string) => void
  onSuggest: () => void
  onMove: () => void
  onDelete: () => void
  onToggle: () => void
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const isCenter = node.parentId === null
  const [title, setTitle] = useState(node.title)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [defining, setDefining] = useState(false)
  const [defineError, setDefineError] = useState('')

  function saveTitle() {
    const next = title.trim()
    if (!next) return setTitle(node.title)
    if (next !== node.title) onChange({ title: next })
  }

  function add() {
    const next = newTitle.trim()
    if (!next) return
    onAdd(next)
    setNewTitle('')
  }

  async function aiDefine() {
    setDefining(true)
    setDefineError('')
    try {
      onChange({ definition: await writeDefinition(lang, path, siblings, childTitles) })
    } catch (e) {
      console.error(e)
      setDefineError(aiErrorMessage(e, t))
    } finally {
      setDefining(false)
    }
  }

  const now = useNow()
  const button = 'rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700'

  return (
    <section className="max-h-[56dvh] space-y-3 overflow-y-auto rounded-t-3xl bg-white px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-12px_rgb(15_23_42/0.3)] dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className="h-1 w-10" />
        <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        <button onClick={onClose} className="w-10 text-right text-sm text-slate-500">
          ✕
        </button>
      </div>

      {path.length > 1 && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{path.slice(0, -1).join(' › ')}</p>}
      <label className="block">
        <span className="sr-only">{isCenter ? t.map.theme : t.map.item}</span>
        <input
          value={isCenter && isInbox ? path[0] : title}
          disabled={isCenter && isInbox}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.currentTarget.blur()}
          placeholder={t.map.titlePlaceholder}
          className="w-full rounded-lg bg-transparent text-xl font-bold outline-none focus:bg-slate-50 dark:focus:bg-slate-800"
        />
      </label>

      {cards.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {cards.map((c) => {
            const memory = retrievability(c.card, now)
            return (
              <span key={c.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {c.kind === 'explain' ? t.mapReview.definition : t.mapReview.branches} · {t.map.nextReview(t.daysFromNow(daysUntil(c.due, now)))}
                {memory !== null && ` · ${t.map.memoryOf(Math.round(memory * 100))}`}
              </span>
            )
          })}
        </div>
      )}

      {!(isCenter && isInbox) && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{t.map.definition}</span>
            <button onClick={aiDefine} disabled={defining} className="text-sm font-semibold text-indigo-600 disabled:opacity-50 dark:text-indigo-300">
              {defining ? t.map.writing : t.map.aiDefinition}
            </button>
          </div>
          {/* 保存した定義が変わったら（AI が書いたときなど）作り直して、新しい定義を出す */}
          <DefinitionField key={node.definition} value={node.definition} onSave={(definition) => onChange({ definition })} />
          <p className="text-xs text-slate-500 dark:text-slate-400">{defineError || t.map.definitionHint}</p>
        </div>
      )}

      {depth === 1 && !isInbox && (
        <div className="space-y-1.5">
          <span className="text-sm font-semibold">{t.map.color}</span>
          <div className="flex flex-wrap gap-2.5">
            {BRANCH_COLOR_KEYS.map((key: BranchColor) => (
              <button
                key={key}
                onClick={() => onChange({ color: key })}
                aria-label={key}
                aria-pressed={node.color === key}
                className={`size-8 rounded-full ${node.color === key ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900' : ''}`}
                style={{ background: BRANCH_COLORS[key] }}
              />
            ))}
          </div>
        </div>
      )}

      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) add()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder={t.map.addPlaceholder(isCenter && isInbox ? path[0] : node.title)}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          />
          <button onClick={add} disabled={!newTitle.trim()} className="rounded-xl bg-indigo-600 px-4 font-semibold text-white disabled:opacity-40">
            {t.map.add}
          </button>
          <button onClick={() => setAdding(false)} className="rounded-xl px-2 text-sm text-slate-500">
            {t.map.close}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setAdding(true)} className="rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white">
            {t.map.addBranch}
          </button>
          {isInbox ? (
            !isCenter && (
              <button onClick={onMove} className={`${button} text-indigo-600 dark:text-indigo-300`}>
                {t.map.move}
              </button>
            )
          ) : (
            <button onClick={onSuggest} className={`${button} text-indigo-600 dark:text-indigo-300`}>
              {t.map.aiSuggest}
            </button>
          )}
          {childCount > 0 && !isCenter && (
            <button onClick={onToggle} className={button}>
              {collapsed ? t.map.expand : t.map.collapse}
            </button>
          )}
          {!isCenter && !isInbox && (
            <button onClick={onMove} className={button}>
              {t.map.move}
            </button>
          )}
          {!isCenter && (
            <button onClick={onDelete} className={`${button} text-rose-600 dark:text-rose-400`}>
              {t.map.delete}
            </button>
          )}
        </div>
      )}
      {cards.length === 0 && !isCenter && <p className="text-xs text-slate-400">{t.map.newCards}</p>}
    </section>
  )
}

/** キーボードを除いた画面の高さ（iPhone でキーボードを出しても、下のシートがキーボードの上に来るように） */
function useViewportHeight(): number | undefined {
  const [height, setHeight] = useState(() => window.visualViewport?.height)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => setHeight(viewport.height)
    viewport.addEventListener('resize', update)
    return () => viewport.removeEventListener('resize', update)
  }, [])
  return height
}

/** 定義の入力欄。入力を終えたら（フォーカスが外れたら）保存する */
function DefinitionField({ value, onSave }: { value: string; onSave: (definition: string) => void }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(value)
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onSave(draft.trim())}
      rows={3}
      placeholder={t.map.definitionPlaceholder}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base leading-relaxed dark:border-slate-700 dark:bg-slate-950"
    />
  )
}
