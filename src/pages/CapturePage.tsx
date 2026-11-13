import { useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { aiErrorMessage, placeNote } from '../lib/ai'
import { nextBranchColor } from '../lib/branchColors'
import type { MapNode } from '../lib/db'
import { createMissingCards, getInbox, insertNodes, loadLibrary, type Library } from '../lib/maps'
import { buildOutline } from '../lib/outline'
import { buildTree, nextPosition } from '../lib/tree'
import { unsavedChangesAtom } from '../lib/unsaved'

interface Proposal {
  parentId: string
  path: string
  title: string
  definition: string
  checked: boolean
}

/** 学んだことを一言で書きとめる。受信箱に入れるか、AI に置き場所を考えてもらってマップに入れる */
export function CapturePage() {
  const { t, lang } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'inbox' | 'ai' | 'add' | null>(null)
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ message: string; to: string; label: string } | null>(null)

  // 書きかけのまま別の画面へ移るときは確認する
  const setUnsaved = useSetAtom(unsavedChangesAtom)
  const dirty = text.trim() !== '' && !done
  useEffect(() => {
    setUnsaved(dirty)
    return () => setUnsaved(false)
  }, [dirty, setUnsaved])

  function reset() {
    setText('')
    setProposals(null)
    setError('')
    setDone(null)
  }

  /** 受信箱に入れる。1行目を項目の名前に、残りを定義にする */
  async function toInbox() {
    const [first, ...rest] = text.trim().split('\n')
    const title = first.length > 80 ? `${first.slice(0, 80)}…` : first
    const definition = first.length > 80 ? text.trim() : rest.join('\n').trim()
    setBusy('inbox')
    setError('')
    try {
      const inbox = await getInbox(t.maps.inbox)
      const library = await loadLibrary()
      const siblings = buildTree(library.nodes).children(inbox.centerId)
      const now = new Date()
      const node: MapNode = { id: crypto.randomUUID(), mapId: inbox.mapId, parentId: inbox.centerId, position: nextPosition(siblings), title, definition, color: null, createdAt: now, updatedAt: now }
      await insertNodes([node])
      await createMissingCards([node], [], true)
      setDone({ message: t.capture.savedToInbox, to: `/maps/${inbox.mapId}?node=${node.id}`, label: t.capture.open(t.maps.inbox) })
    } catch (e) {
      console.error(e)
      setError(t.common.saveFailed)
    } finally {
      setBusy(null)
    }
  }

  async function organize() {
    setBusy('ai')
    setError('')
    try {
      const library = await loadLibrary()
      const tree = buildTree(library.nodes)
      const outline = buildOutline(library.maps, tree)
      const items = await placeNote(lang, text.trim(), outline.lines)
      const inbox = items.some((item) => !outline.ids.has(item.parent)) ? await getInbox(t.maps.inbox) : null
      setProposals(
        items.map((item) => {
          const parentId = outline.ids.get(item.parent) ?? inbox!.centerId
          const path = outline.lines.find((l) => l.ref === item.parent)?.path ?? t.maps.inbox
          return { parentId, path, title: item.title.trim(), definition: item.definition.trim(), checked: true }
        }),
      )
    } catch (e) {
      console.error(e)
      setError(aiErrorMessage(e, t))
    } finally {
      setBusy(null)
    }
  }

  async function addProposals() {
    const chosen = proposals?.filter((p) => p.checked) ?? []
    if (chosen.length === 0) return
    setBusy('add')
    setError('')
    try {
      // 受信箱を作ったばかりのこともあるので、読み直してから足す
      const library: Library = await loadLibrary()
      const tree = buildTree(library.nodes)
      const now = new Date()
      const added: MapNode[] = []
      for (const p of chosen) {
        const parent = tree.byId.get(p.parentId)
        if (!parent) continue
        const siblings = [...tree.children(parent.id), ...added.filter((n) => n.parentId === parent.id)]
        const isInbox = library.maps.find((m) => m.id === parent.mapId)?.kind === 'inbox'
        added.push({
          id: crypto.randomUUID(),
          mapId: parent.mapId,
          parentId: parent.id,
          position: nextPosition(siblings),
          title: p.title,
          definition: p.definition,
          color: parent.parentId === null && !isInbox ? nextBranchColor(siblings.map((s) => s.color)) : null,
          createdAt: now,
          updatedAt: now,
        })
      }
      await insertNodes(added)
      // マップごとに、新しい定義の「定義」カードと、枝が2つ以上になった親の「枝」カードを作る
      for (const mapId of new Set(added.map((n) => n.mapId))) {
        const map = library.maps.find((m) => m.id === mapId)
        const nodes = [...library.nodes.filter((n) => n.mapId === mapId), ...added.filter((n) => n.mapId === mapId)]
        const ids = new Set(nodes.map((n) => n.id))
        await createMissingCards(nodes, library.cards.filter((c) => ids.has(c.nodeId)), map?.kind === 'inbox')
      }
      const first = added[0]
      const center = first && tree.center(first.mapId)
      const isInbox = library.maps.find((m) => m.id === first?.mapId)?.kind === 'inbox'
      setDone({
        message: t.capture.added(added.length),
        to: first ? `/maps/${first.mapId}?node=${first.id}` : '/maps',
        label: t.capture.open(isInbox ? t.maps.inbox : (center?.title ?? '')),
      })
    } catch (e) {
      console.error(e)
      setError(t.common.saveFailed)
    } finally {
      setBusy(null)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-5xl">✅</p>
        <p className="font-semibold">{done.message}</p>
        <Link to={done.to} className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white">
          {done.label}
        </Link>
        <button onClick={reset} className="w-full rounded-xl bg-slate-200 py-3 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t.capture.another}
        </button>
      </div>
    )
  }

  const chosen = proposals?.filter((p) => p.checked).length ?? 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t.capture.title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.capture.intro}</p>
      </div>

      <textarea
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setProposals(null)
        }}
        rows={6}
        placeholder={t.capture.placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 leading-relaxed shadow-sm dark:border-slate-700 dark:bg-slate-900"
      />

      {!proposals && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={toInbox}
            disabled={!text.trim() || !!busy}
            className="rounded-xl border border-slate-200 bg-white py-3 font-semibold disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
          >
            {t.capture.toInbox}
          </button>
          <button onClick={organize} disabled={!text.trim() || !!busy} className="rounded-xl bg-indigo-600 py-3 font-semibold text-white disabled:opacity-40">
            {t.capture.organize}
          </button>
        </div>
      )}

      {busy === 'ai' && <p className="text-center text-sm text-slate-500">{t.capture.organizing}</p>}
      {error && <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>}

      {proposals && (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{t.capture.proposal}</h2>
          <ul className="space-y-2">
            {proposals.map((p, i) => (
              <li key={i}>
                <label className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={p.checked}
                    onChange={(e) => setProposals((list) => list!.map((q, j) => (j === i ? { ...q, checked: e.target.checked } : q)))}
                    className="mt-1 size-4 shrink-0 accent-indigo-600"
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block truncate text-xs text-indigo-600 dark:text-indigo-300">{t.capture.addTo(p.path)}</span>
                    <span className="block font-semibold">{p.title}</span>
                    {p.definition && <span className="block text-sm leading-relaxed text-slate-500 dark:text-slate-400">{p.definition}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button onClick={addProposals} disabled={chosen === 0 || !!busy} className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white disabled:opacity-40">
            {t.capture.addSelected(chosen)}
          </button>
          <button onClick={toInbox} disabled={!!busy} className="w-full text-sm text-slate-500">
            {t.capture.toInbox}
          </button>
        </section>
      )}
    </div>
  )
}
