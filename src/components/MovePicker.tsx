import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { aiErrorMessage, placeNote } from '../lib/ai'
import type { MapNode } from '../lib/db'
import { loadLibrary } from '../lib/maps'
import { buildOutline } from '../lib/outline'
import { buildTree } from '../lib/tree'
import { useData } from '../lib/useData'

/** 項目を枝ごと移す先を選ぶ（ほかのマップへも）。AI に置き場所を聞くこともできる */
export function MovePicker({ node, exclude, onMove, onClose }: { node: MapNode; exclude: Set<string>; onMove: (parent: MapNode) => void; onClose: () => void }) {
  const { t, lang } = useI18n()
  const library = useData(loadLibrary, [])
  const [search, setSearch] = useState('')
  const [ai, setAi] = useState<{ busy: boolean; picks: MapNode[]; error: string }>({ busy: false, picks: [], error: '' })

  const tree = useMemo(() => buildTree(library?.nodes ?? []), [library])
  // マップごとに、中心から順に（深さつきで）並べる。受信箱は最後
  const rows = useMemo(() => {
    if (!library) return []
    const result: { node: MapNode; depth: number; path: string }[] = []
    const maps = [...library.maps].sort((a, b) => Number(a.kind === 'inbox') - Number(b.kind === 'inbox'))
    for (const map of maps) {
      const visit = (n: MapNode, depth: number, path: string) => {
        if (exclude.has(n.id)) return
        result.push({ node: n, depth, path })
        for (const child of tree.children(n.id)) visit(child, depth + 1, `${path} › ${child.title}`)
      }
      const center = tree.center(map.id)
      if (center) visit(center, 0, map.kind === 'inbox' ? t.maps.inbox : center.title)
    }
    return result
  }, [library, tree, exclude, t])

  const keyword = search.trim().toLowerCase()
  const shown = keyword ? rows.filter((r) => r.path.toLowerCase().includes(keyword)) : rows
  const pathOf = (n: MapNode) => rows.find((r) => r.node.id === n.id)?.path ?? n.title

  async function askAi() {
    if (!library) return
    setAi({ busy: true, picks: [], error: '' })
    try {
      const outline = buildOutline(library.maps, tree, exclude)
      const items = await placeNote(lang, `${node.title}\n${node.definition}`, outline.lines)
      const picks = [...new Set(items.map((item) => outline.ids.get(item.parent)).filter((id): id is string => !!id))]
        .map((id) => tree.byId.get(id))
        .filter((n): n is MapNode => !!n)
      setAi({ busy: false, picks, error: picks.length ? '' : t.map.aiNoPlace })
    } catch (e) {
      console.error(e)
      setAi({ busy: false, picks: [], error: aiErrorMessage(e, t) })
    }
  }

  const row = (n: MapNode, label: string, depth = 0, highlight = false) => (
    <button
      key={n.id + (highlight ? ':ai' : '')}
      onClick={() => onMove(n)}
      className={`block w-full truncate rounded-lg py-2.5 pr-3 text-left text-sm active:bg-slate-100 dark:active:bg-slate-800 ${
        highlight ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : ''
      }`}
      style={{ paddingLeft: 12 + depth * 16 }}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-100 pt-[env(safe-area-inset-top)] dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 overflow-hidden px-4 pt-4">
        <header className="flex items-center justify-between gap-3">
          <h2 className="truncate font-bold">{t.map.moveTitle(node.title)}</h2>
          <button onClick={onClose} className="shrink-0 text-sm text-slate-500">
            {t.map.cancel}
          </button>
        </header>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.map.moveSearch}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          onClick={askAi}
          disabled={ai.busy || !library}
          className="rounded-xl border border-indigo-200 py-2.5 text-sm font-semibold text-indigo-600 disabled:opacity-50 dark:border-indigo-900 dark:text-indigo-300"
        >
          {ai.busy ? t.map.aiPlacing : t.map.aiPlace}
        </button>
        {ai.error && <p className="text-sm text-amber-600 dark:text-amber-400">{ai.error}</p>}
        {ai.picks.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-slate-500">{t.map.aiPick}</p>
            {ai.picks.map((n) => row(n, pathOf(n), 0, true))}
          </div>
        )}
        <div className="-mx-1 flex-1 overflow-y-auto rounded-2xl bg-white p-1 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-sm dark:bg-slate-900">
          {!library && <p className="p-4 text-center text-sm text-slate-500">…</p>}
          {shown.map((r) => row(r.node, keyword ? r.path : r.depth === 0 ? r.path : r.node.title, keyword ? 0 : r.depth))}
          {library && shown.length === 0 && <p className="p-4 text-center text-sm text-slate-500">{t.maps.notFound}</p>}
        </div>
      </div>
    </div>
  )
}
