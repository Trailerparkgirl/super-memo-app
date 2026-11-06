import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Grade } from 'ts-fsrs'
import { WordTools } from '../components/WordTools'
import { useI18n } from '../i18n'
import { type Memo } from '../lib/db'
import { deleteMemo, listDueMemos, recordReview, updateMemo } from '../lib/memos'
import { GRADES, overdueDays, preview } from '../lib/scheduler'

export function ReviewPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  // 開始時点の復習対象を固定する（途中で一覧が変わらないように）
  const [queue, setQueue] = useState<Memo[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<unknown>()
  // 復習中に間違いに気づいたら、その場で直せる
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null)

  useEffect(() => {
    listDueMemos().then(setQueue, setLoadError)
  }, [])

  const memo = queue?.[index]
  const outcomes = useMemo(() => (memo && revealed ? preview(memo.card) : null), [memo, revealed])

  async function saveEdit() {
    if (!memo || !draft || saving) return
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
    setQueue((list) => list?.map((m) => (m.id === memo.id ? { ...m, title, body } : m)) ?? null)
    setDraft(null)
  }

  async function remove() {
    if (!memo || saving || !confirm(t.edit.confirmDelete)) return
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
    // 消したメモの位置に次のメモが来るので、indexはそのまま
    setQueue((list) => list?.filter((m) => m.id !== memo.id) ?? null)
    setDraft(null)
    setRevealed(false)
  }

  async function rate(grade: Grade) {
    if (!memo || !outcomes || saving) return
    setSaving(true)
    try {
      await recordReview(memo, grade, outcomes[grade])
    } catch (e) {
      // 同じカードのまま、もう一度評価できる
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    setRevealed(false)
    setDraft(null)
    setIndex((i) => i + 1)
  }

  if (loadError) throw loadError
  if (!queue) return null

  if (!memo) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-5xl">🎉</p>
        <h1 className="text-xl font-bold">{t.review.doneTitle(queue.length)}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t.review.doneBody}</p>
        <Link to="/" className="rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white">
          {t.review.backHome}
        </Link>
      </div>
    )
  }

  const isNote = memo.type === 'note'
  const isWord = memo.type === 'word'
  const [titleLabel, bodyLabel] = isWord ? [t.edit.word, t.edit.meaning] : isNote ? [t.edit.title, t.edit.content] : [t.edit.question, t.edit.answer]
  const fieldClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-950'

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col gap-4">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t.review.quit}
        </button>
        <span className="text-sm tabular-nums text-slate-500">
          {index + 1} / {queue.length}
        </span>
      </header>
      <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      {draft ? (
        <article className="flex-1 space-y-3 rounded-2xl bg-white p-5 text-sm shadow-sm dark:bg-slate-900">
          <label className="block space-y-1">
            <span className="font-semibold">{titleLabel}</span>
            <textarea value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} rows={2} autoFocus className={fieldClass} />
          </label>
          <label className="block space-y-1">
            <span className="font-semibold">{bodyLabel}</span>
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={4} className={fieldClass} />
          </label>
          <button onClick={remove} disabled={saving} className="w-full rounded-xl border border-rose-200 py-3 font-semibold text-rose-600 dark:border-rose-900">
            {t.edit.delete}
          </button>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={() => setDraft(null)} disabled={saving} className="rounded-xl bg-slate-100 py-3 font-semibold dark:bg-slate-800">
              {t.review.cancelEdit}
            </button>
            <button
              onClick={saveEdit}
              disabled={saving || !draft.title.trim()}
              className="rounded-xl bg-indigo-600 py-3 font-semibold text-white disabled:opacity-40"
            >
              {t.review.saveEdit}
            </button>
          </div>
        </article>
      ) : (
        <article className="flex-1 space-y-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {t.memoType[memo.type]}
            </span>
            {memo.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                #{tag}
              </span>
            ))}
            <button onClick={() => setDraft({ title: memo.title, body: memo.body })} className="ml-auto text-sm text-indigo-600 dark:text-indigo-300">
              {t.review.edit}
            </button>
          </div>
          <h2 className="text-xl font-bold whitespace-pre-wrap">{memo.title}</h2>

          {revealed ? (
            <>
              <div className="border-t border-slate-200 pt-4 whitespace-pre-wrap leading-relaxed dark:border-slate-700">
                {!isNote && <p className="mb-1 text-xs font-semibold text-slate-500">{isWord ? t.review.meaning : t.review.answer}</p>}
                {memo.body || <span className="text-slate-400">{t.review.noBody}</span>}
              </div>
              {isWord && <WordTools key={memo.id} word={memo.title.trim()} />}
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isWord ? t.review.recallWord : isNote ? t.review.recallNote : t.review.recallQa}
            </p>
          )}
        </article>
      )}

      <div className="pb-[env(safe-area-inset-bottom)]">
        {draft ? null : outcomes ? (
          <>
            {overdueDays(memo.card) > 0 && (
              <p className="mb-1 text-center text-xs text-amber-600 dark:text-amber-400">{t.review.overdue(overdueDays(memo.card))}</p>
            )}
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
            {isNote ? t.review.showContent : t.review.showAnswer}
          </button>
        )}
      </div>
    </div>
  )
}
