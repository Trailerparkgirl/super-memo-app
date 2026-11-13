import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import type { MapNode } from '../lib/db'
import { createMap, loadLibrary } from '../lib/maps'
import { endOfDay, retrievability } from '../lib/scheduler'
import { buildTree } from '../lib/tree'
import { useData } from '../lib/useData'
import { useToday } from '../lib/useNow'

export function MapListPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const today = useToday()
  const [search, setSearch] = useState('')
  // ホームの「最初のマップを作る」から来たときは ?new=1 で入力欄を開いておく
  const [params] = useSearchParams()
  const [creating, setCreating] = useState(params.get('new') === '1')
  const [theme, setTheme] = useState('')
  const [busy, setBusy] = useState(false)

  // マップごとの項目数・今日の件数・思い出せる確率の平均
  const data = useData(async () => {
    const library = await loadLibrary()
    const tree = buildTree(library.nodes)
    const now = new Date()
    const end = endOfDay(now).getTime()
    const mapOfNode = new Map(library.nodes.map((n) => [n.id, n.mapId]))
    const summaries = library.maps
      .map((map) => {
        const center = tree.center(map.id)
        const nodes = library.nodes.filter((n) => n.mapId === map.id)
        const cards = library.cards.filter((c) => mapOfNode.get(c.nodeId) === map.id)
        const memories = cards.flatMap((c) => retrievability(c.card, now) ?? [])
        return {
          map,
          center,
          count: nodes.length - 1,
          due: cards.filter((c) => c.due <= end).length,
          memory: memories.length ? memories.reduce((a, b) => a + b, 0) / memories.length : null,
          colors: center ? tree.children(center.id).map((n) => tree.color(n.id)) : [],
          updated: Math.max(...nodes.map((n) => n.updatedAt.getTime())),
        }
      })
      .filter((s) => s.center && !(s.map.kind === 'inbox' && s.count === 0))
      .sort((a, b) => Number(b.map.kind === 'inbox') - Number(a.map.kind === 'inbox') || b.updated - a.updated)
    return { library, tree, summaries }
  }, [today])
  const library = data?.library
  const tree = data?.tree
  const summaries = data?.summaries ?? []

  // 項目の名前と定義から探す
  const keyword = search.trim().toLowerCase()
  const results = useMemo(() => {
    if (!library || !tree || !keyword) return []
    const inboxes = new Set(library.maps.filter((m) => m.kind === 'inbox').map((m) => m.id))
    const pathOf = (n: MapNode) =>
      tree
        .path(n.id)
        .map((p) => (p.parentId === null && inboxes.has(p.mapId) ? t.maps.inbox : p.title))
        .join(' › ')
    return library.nodes
      .filter((n) => n.title.toLowerCase().includes(keyword) || n.definition.toLowerCase().includes(keyword))
      .slice(0, 100)
      .map((n) => ({ node: n, path: pathOf(n) }))
  }, [library, tree, keyword, t])

  async function create() {
    const title = theme.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      const { mapId } = await createMap(title)
      // 作ったらすぐに、テーマから伸ばす枝を AI が提案する
      navigate(`/maps/${mapId}?suggest=1`)
    } catch (e) {
      console.error(e)
      alert(t.common.saveFailed)
      setBusy(false)
    }
  }

  if (!library) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.maps.title}</h1>
        {!creating && (
          <button onClick={() => setCreating(true)} className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
            {t.maps.newMap}
          </button>
        )}
      </div>

      {creating && (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <label className="block space-y-1">
            <span className="text-sm text-slate-600 dark:text-slate-300">{t.maps.themeLabel}</span>
            <input
              autoFocus
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && create()}
              placeholder={t.maps.themePlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setCreating(false)} className="rounded-xl bg-slate-100 py-2.5 font-semibold dark:bg-slate-800">
              {t.maps.cancel}
            </button>
            <button onClick={create} disabled={!theme.trim() || busy} className="rounded-xl bg-indigo-600 py-2.5 font-semibold text-white disabled:opacity-40">
              {t.maps.create}
            </button>
          </div>
        </section>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t.maps.search}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900"
      />

      {keyword ? (
        <ul className="space-y-2">
          {results.length === 0 && <p className="py-10 text-center text-sm text-slate-500">{t.maps.notFound}</p>}
          {results.map(({ node, path }) => (
            <li key={node.id}>
              <Link to={`/maps/${node.mapId}?node=${node.id}`} className="block rounded-xl bg-white p-4 shadow-sm active:bg-slate-50 dark:bg-slate-900 dark:active:bg-slate-800">
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{path}</p>
                <p className="mt-0.5 font-semibold">{node.title}</p>
                {node.definition && <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{node.definition}</p>}
              </Link>
            </li>
          ))}
        </ul>
      ) : summaries.length === 0 ? (
        <p className="rounded-2xl bg-white p-5 text-center text-sm leading-relaxed text-slate-500 shadow-sm dark:bg-slate-900">{t.maps.empty}</p>
      ) : (
        <ul className="space-y-2">
          {summaries.map(({ map, center, count, due, memory, colors }) => (
            <li key={map.id}>
              <Link to={`/maps/${map.id}`} className="block rounded-xl bg-white p-4 shadow-sm active:bg-slate-50 dark:bg-slate-900 dark:active:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-lg font-bold">{map.kind === 'inbox' ? `📥 ${t.maps.inbox}` : center?.title}</p>
                  {due > 0 && (
                    <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">{t.maps.due(due)}</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                  {colors.length > 0 && (
                    <span className="flex -space-x-1">
                      {colors.slice(0, 8).map((color, i) => (
                        <span key={i} className="size-3 rounded-full ring-2 ring-white dark:ring-slate-900" style={{ background: color }} />
                      ))}
                    </span>
                  )}
                  <span>{t.maps.items(count)}</span>
                  {memory !== null && <span className="ml-auto">{t.maps.memory(Math.round(memory * 100))}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
