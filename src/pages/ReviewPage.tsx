import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Grade } from 'ts-fsrs'
import { useI18n } from '../i18n'
import { type Memo } from '../lib/db'
import { dueMemosQuery, recordReview } from '../lib/memos'
import { GRADES, preview } from '../lib/scheduler'

export function ReviewPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  // 開始時点の復習対象を固定する（途中で一覧が変わらないように）
  const [queue, setQueue] = useState<Memo[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dueMemosQuery().sortBy('due').then(setQueue)
  }, [])

  const memo = queue?.[index]
  const outcomes = useMemo(() => (memo && revealed ? preview(memo.card) : null), [memo, revealed])

  async function rate(grade: Grade) {
    if (!memo || !outcomes || saving) return
    setSaving(true)
    await recordReview(memo, grade, outcomes[grade])
    setSaving(false)
    setRevealed(false)
    setIndex((i) => i + 1)
  }

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

  const isQa = memo.type === 'qa'

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col gap-4">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="text-sm text-slate-500">
          {t.review.quit}
        </button>
        <span className="text-sm tabular-nums text-slate-500">
          {index + 1} / {queue.length}
        </span>
      </header>
      <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      <article className="flex-1 space-y-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {t.memoType[memo.type]}
          </span>
          {memo.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              #{tag}
            </span>
          ))}
        </div>
        <h2 className="text-xl font-bold whitespace-pre-wrap">{memo.title}</h2>

        {revealed ? (
          <div className="border-t border-slate-200 pt-4 whitespace-pre-wrap leading-relaxed dark:border-slate-700">
            {isQa && <p className="mb-1 text-xs font-semibold text-slate-500">{t.review.answer}</p>}
            {memo.body || <span className="text-slate-400">{t.review.noBody}</span>}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{isQa ? t.review.recallQa : t.review.recallNote}</p>
        )}
      </article>

      <div className="pb-[env(safe-area-inset-bottom)]">
        {outcomes ? (
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
            {isQa ? t.review.showAnswer : t.review.showContent}
          </button>
        )}
      </div>
    </div>
  )
}
