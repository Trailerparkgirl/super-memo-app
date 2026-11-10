import { useSetAtom } from 'jotai'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Grade } from 'ts-fsrs'
import { WordTools } from '../components/WordTools'
import { useI18n } from '../i18n'
import { type Memo } from '../lib/db'
import { flashCards, getDirection, pickNext, setDirection as saveDirection, type FlashDirection } from '../lib/flash'
import { focusModeAtom } from '../lib/focus'
import { deleteMemo, listMemos, recordReview, undoReview, updateMemo } from '../lib/memos'
import { GRADES, preview } from '../lib/scheduler'
import { useData } from '../lib/useData'

/** 好きなときに単語を練習できる。評価は通常の復習と同じように次の復習日に反映される。 */
export function FlashPage() {
  const { t } = useI18n()
  const memos = useData(listMemos, [])
  const [direction, setDirection] = useState(getDirection)
  const [tag, setTag] = useState<string | null>(null)
  // 練習中のカード（開始時点のものを使い、途中で一覧が変わっても影響しない）
  const [session, setSession] = useState<Memo[] | null>(null)

  const words = useMemo(() => flashCards(memos ?? [], null), [memos])
  const tags = useMemo(() => [...new Set(words.flatMap((m) => m.tags))].sort(), [words])
  const cards = useMemo(() => flashCards(words, tag), [words, tag])

  if (!memos) return null
  if (session) return <FlashSession cards={session} direction={direction} onQuit={() => setSession(null)} />

  function chooseDirection(next: FlashDirection) {
    setDirection(next)
    saveDirection(next)
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t.flash.title}</h1>
          <Link to="/memos/new?type=word" className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
            {t.flash.addWord}
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.flash.intro}</p>
      </div>

      <section className="space-y-3 rounded-2xl bg-white p-5 text-sm shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">{t.flash.direction}</h2>
        <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
          {(
            [
              ['front', t.flash.wordToMeaning],
              ['back', t.flash.meaningToWord],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => chooseDirection(value)}
              className={`rounded-lg py-2 ${direction === value ? 'bg-white font-semibold shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tags.length > 0 && (
          <>
            <h2 className="pt-2 font-semibold">{t.flash.tag}</h2>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setTag(null)} className={chip(tag === null)}>
                {t.flash.allTags}
              </button>
              {tags.map((name) => (
                <button key={name} onClick={() => setTag(name)} className={chip(tag === name)}>
                  #{name}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {cards.length > 0 ? (
        <>
          <button onClick={() => setSession(cards)} className="w-full rounded-xl bg-indigo-600 py-4 font-semibold text-white">
            {t.flash.start(cards.length)}
          </button>
          <Link to="/memos?type=word" className="block text-center text-sm text-slate-500 underline">
            {t.flash.wordList}
          </Link>
        </>
      ) : (
        <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-500 shadow-sm dark:bg-slate-900">{t.flash.empty}</p>
      )}
    </div>
  )
}

function FlashSession({ cards: initialCards, direction, onQuit }: { cards: Memo[]; direction: FlashDirection; onQuit: () => void }) {
  const { t } = useI18n()
  // 評価するとカードの学習状況が変わるので、手元でも更新しておく
  const [cards, setCards] = useState(initialCards)
  const [lastGrades, setLastGrades] = useState(() => new Map<string, Grade>())
  const [memo, setMemo] = useState(() => pickNext(initialCards, lastGrades))
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [count, setCount] = useState(0)
  // 練習中に単語や意味の間違いに気づいたら、その場で直せる
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null)
  // 押し間違えたら、直前の評価を取り消せる（評価する前のカードと練習中の評価を覚えておく）
  const [last, setLast] = useState<{ memo: Memo; logId: number; grades: Map<string, Grade> } | null>(null)

  const outcomes = useMemo(() => (revealed ? preview(memo.card) : null), [memo, revealed])

  // 練習中は復習と同じく全画面にする（タブバーを隠す）
  const setFocusMode = useSetAtom(focusModeAtom)
  useEffect(() => {
    setFocusMode(true)
    return () => setFocusMode(false)
  }, [setFocusMode])

  async function saveEdit() {
    if (!draft || saving) return
    const title = draft.title.trim()
    const body = draft.body.trim()
    if (!title) return
    setSaving(true)
    try {
      await updateMemo(memo.id, { type: memo.type, title, body, tags: memo.tags })
    } catch (e) {
      // 入力した内容のまま、もう一度保存できる
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    const updated = { ...memo, title, body }
    setCards((list) => list.map((m) => (m.id === memo.id ? updated : m)))
    setMemo(updated)
    setDraft(null)
  }

  async function remove() {
    if (saving || !confirm(t.edit.confirmDelete)) return
    setSaving(true)
    try {
      await deleteMemo(memo.id)
    } catch (e) {
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    const rest = cards.filter((m) => m.id !== memo.id)
    // 最後の1枚を消したら練習を終える
    if (rest.length === 0) return onQuit()
    setCards(rest)
    setMemo(pickNext(rest, lastGrades, memo.id))
    setDraft(null)
    setRevealed(false)
  }

  async function rate(grade: Grade) {
    if (!outcomes || saving) return
    const result = outcomes[grade]
    setSaving(true)
    let logId: number
    try {
      logId = await recordReview(memo, grade, result)
    } catch (e) {
      // 同じカードのまま、もう一度評価できる
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    const updated = { ...memo, card: result.card, due: result.card.due.getTime() }
    const nextCards = cards.map((m) => (m.id === memo.id ? updated : m))
    const nextGrades = new Map(lastGrades).set(memo.id, grade)
    setLast({ memo, logId, grades: lastGrades })
    setCards(nextCards)
    setLastGrades(nextGrades)
    setMemo(pickNext(nextCards, nextGrades, memo.id))
    setCount((n) => n + 1)
    setRevealed(false)
  }

  async function undo() {
    if (!last || saving) return
    const { card, due } = last.memo
    setSaving(true)
    try {
      await undoReview(last.memo.id, last.logId, card)
    } catch (e) {
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    // 評価した後に直した単語や意味はそのまま残す
    const current = cards.find((m) => m.id === last.memo.id) ?? last.memo
    const restored = { ...current, card, due }
    setCards((list) => list.map((m) => (m.id === restored.id ? restored : m)))
    setLastGrades(last.grades)
    setMemo(restored)
    setCount((n) => n - 1)
    setLast(null)
    setDraft(null)
    // 答えを出したまま戻るので、すぐに評価し直せる
    setRevealed(true)
  }

  const [prompt, answer] = direction === 'front' ? [memo.title, memo.body] : [memo.body, memo.title]

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col gap-4">
      <header className="flex items-center justify-between">
        <button onClick={onQuit} className="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t.flash.quit}
        </button>
        <div className="flex items-center gap-4">
          {last && (
            <button onClick={undo} disabled={saving} className="text-sm font-semibold text-indigo-600 disabled:opacity-40 dark:text-indigo-300">
              {t.flash.undo}
            </button>
          )}
          <span className="text-sm tabular-nums text-slate-500">{t.flash.practiced(count)}</span>
        </div>
      </header>

      {draft ? (
        <article className="flex-1 space-y-3 rounded-2xl bg-white p-5 text-sm shadow-sm dark:bg-slate-900">
          <label className="block space-y-1">
            <span className="font-semibold">{t.edit.word}</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              autoFocus
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="block space-y-1">
            <span className="font-semibold">{t.edit.meaning}</span>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <button onClick={remove} disabled={saving} className="w-full rounded-xl border border-rose-200 py-3 font-semibold text-rose-600 dark:border-rose-900">
            {t.edit.delete}
          </button>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={() => setDraft(null)} disabled={saving} className="rounded-xl bg-slate-100 py-3 font-semibold dark:bg-slate-800">
              {t.flash.cancelEdit}
            </button>
            <button
              onClick={saveEdit}
              disabled={saving || !draft.title.trim()}
              className="rounded-xl bg-indigo-600 py-3 font-semibold text-white disabled:opacity-40"
            >
              {t.flash.saveEdit}
            </button>
          </div>
        </article>
      ) : (
        <article className="flex-1 space-y-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="flex justify-end">
            <button
              onClick={() => setDraft({ title: memo.title, body: memo.body })}
              className="text-sm text-indigo-600 dark:text-indigo-300"
            >
              {t.flash.edit}
            </button>
          </div>
          <p className="min-h-24 text-center text-2xl font-bold whitespace-pre-wrap">{prompt}</p>
          {revealed ? (
            <>
              <p className="border-t border-slate-200 pt-4 text-center text-lg whitespace-pre-wrap dark:border-slate-700">{answer}</p>
              <WordTools key={`${memo.id}-${count}-${memo.title}`} word={memo.title.trim()} />
            </>
          ) : (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              {direction === 'front' ? t.flash.recallMeaning : t.flash.recallWord}
            </p>
          )}
        </article>
      )}

      <div className="pb-[env(safe-area-inset-bottom)]">
        {draft ? null : outcomes ? (
          <>
            <p className="mb-2 text-center text-xs text-slate-500">{t.review.howWell}</p>
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map(({ grade, key, color }) => (
                <button
                  key={grade}
                  disabled={saving}
                  onClick={() => rate(grade)}
                  className={`${color} flex flex-col items-center rounded-xl py-3 text-white active:opacity-80`}
                >
                  <span className="text-sm font-semibold">{t.grades[key]}</span>
                  <span className="text-xs opacity-90">{t.interval(outcomes[grade].card.scheduled_days)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <button onClick={() => setRevealed(true)} className="w-full rounded-xl bg-indigo-600 py-4 font-semibold text-white">
            {t.flash.flip}
          </button>
        )}
      </div>
    </div>
  )
}
