import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Rating, type Grade } from 'ts-fsrs'
import { useI18n } from '../i18n'
import { aiErrorMessage, gradeAnswer, type Grading } from '../lib/ai'
import { loadLibrary, recordCardReview, undoCardReview } from '../lib/maps'
import { dueReviewItems, type ReviewItem } from '../lib/mapReview'
import { GRADES, overdueDays, preview } from '../lib/scheduler'

// しばらく空いて復習がたまったら（BACKLOG 件より多いとき）、BATCH 件ずつ進められるようにする
const BACKLOG = 30
const BATCH = 20

const MARKS = {
  ok: { symbol: '○', className: 'text-emerald-600 dark:text-emerald-400' },
  partial: { symbol: '△', className: 'text-amber-600 dark:text-amber-400' },
  missing: { symbol: '−', className: 'text-slate-500' },
  wrong: { symbol: '×', className: 'text-rose-600 dark:text-rose-400' },
} as const

export function MapReviewPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  // ホームでマップを選んだときは ?map=... のように、そのマップだけ復習する
  const mapId = useSearchParams()[0].get('map') ?? undefined
  // 開始時点の復習対象を固定する（途中で一覧が変わらないように）
  const [queue, setQueue] = useState<ReviewItem[] | null>(null)
  const [mapTitle, setMapTitle] = useState('')
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<unknown>()
  // 押し間違えたら、直前の評価を取り消せる
  const [lastLogId, setLastLogId] = useState<number | null>(null)
  // 「忘れてた」にしたカードは、最後にもう一度出して覚え直す（練習なので次の復習日は変えない）
  const [retry, setRetry] = useState<ReviewItem[]>([])
  // たまっているときは、全部やるか少しずつやるかを先に選んでもらう
  const [pending, setPending] = useState<ReviewItem[] | null>(null)
  const [backlog, setBacklog] = useState<ReviewItem[]>([])
  // 話して（書いて）答えたものと、AI の採点
  const [answer, setAnswer] = useState('')
  const [grading, setGrading] = useState<{ busy: boolean; result: Grading | null; error: string }>({ busy: false, result: null, error: '' })

  useEffect(() => {
    loadLibrary().then((library) => {
      const items = dueReviewItems(library, t.maps.inbox, new Date(), mapId)
      if (mapId) setMapTitle(items[0]?.path[0] ?? '')
      if (items.length > BACKLOG) setPending(items)
      else setQueue(items)
    }, setLoadError)
  }, [mapId]) // eslint-disable-line react-hooks/exhaustive-deps

  function start(all: ReviewItem[], count: number) {
    setQueue(all.slice(0, count))
    setBacklog(all.slice(count))
    setPending(null)
  }

  function continueBacklog() {
    setQueue((list) => [...(list ?? []), ...backlog.slice(0, BATCH)])
    setBacklog((list) => list.slice(BATCH))
  }

  const retrying = !!queue && index >= queue.length
  const item = retrying ? retry[0] : queue?.[index]
  const outcomes = useMemo(() => (item && revealed && !retrying ? preview(item.card.card) : null), [item, revealed, retrying])

  function next() {
    setRevealed(false)
    setAnswer('')
    setGrading({ busy: false, result: null, error: '' })
  }

  async function grade() {
    if (!item || !answer.trim()) return
    setGrading({ busy: true, result: null, error: '' })
    try {
      const expected = item.card.kind === 'explain' ? item.node.definition : item.children.map((c) => c.title).join('\n')
      const result = await gradeAnswer(lang, item.path, item.card.kind, expected, answer)
      setGrading({ busy: false, result, error: '' })
      setRevealed(true)
    } catch (e) {
      console.error(e)
      setGrading({ busy: false, result: null, error: aiErrorMessage(e, t) })
    }
  }

  async function rate(grade: Grade) {
    if (!item || !outcomes || saving || retrying) return
    setSaving(true)
    let logId: number
    try {
      logId = await recordCardReview(item.card, grade, outcomes[grade])
    } catch (e) {
      // 同じカードのまま、もう一度評価できる
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    setLastLogId(logId)
    if (grade === Rating.Again) setRetry((list) => [...list, item])
    next()
    setIndex((i) => i + 1)
  }

  /** 覚え直し：思い出せたら終わり、まだ忘れていたら最後に回す */
  function answerRetry(remembered: boolean) {
    setRetry(([first, ...rest]) => (remembered ? rest : [...rest, first]))
    setLastLogId(null)
    next()
  }

  async function undo() {
    // 一覧のカードは評価しても書き換えていないので、評価する前のカードのまま
    const previous = queue?.[index - 1]
    if (!previous || lastLogId === null || saving) return
    setSaving(true)
    try {
      await undoCardReview(previous.card.id, lastLogId, previous.card.card)
    } catch (e) {
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    setRetry((list) => list.filter((r) => r.card.id !== previous.card.id))
    setLastLogId(null)
    next()
    // 答えを出したまま戻るので、すぐに評価し直せる
    setRevealed(true)
    setIndex((i) => i - 1)
  }

  const undoButton = lastLogId !== null && (
    <button onClick={undo} disabled={saving} className="text-sm font-semibold text-indigo-600 disabled:opacity-40 dark:text-indigo-300">
      {t.review.undo}
    </button>
  )

  if (loadError) throw loadError

  if (pending) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-5xl">📚</p>
        <h1 className="text-xl font-bold">{t.review.backlogTitle(pending.length)}</h1>
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t.review.backlogBody}</p>
        <button onClick={() => start(pending, BATCH)} className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white">
          {t.review.doBatch(BATCH)}
        </button>
        <button onClick={() => start(pending, pending.length)} className="w-full rounded-xl bg-slate-200 py-3 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t.review.doAll(pending.length)}
        </button>
        <button onClick={() => navigate('/')} className="text-sm text-slate-500">
          {t.review.backHome}
        </button>
      </div>
    )
  }

  if (!queue) return null

  if (!item) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-5xl">🎉</p>
        <h1 className="text-xl font-bold">{t.review.doneTitle(queue.length)}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{backlog.length > 0 ? t.review.backlogLeft(backlog.length) : t.review.doneBody}</p>
        {undoButton}
        {backlog.length > 0 && (
          <button onClick={continueBacklog} className="rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white">
            {t.review.doMore(Math.min(BATCH, backlog.length))}
          </button>
        )}
        <Link
          to="/"
          className={
            backlog.length > 0
              ? 'rounded-xl bg-slate-200 px-8 py-3 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              : 'rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white'
          }
        >
          {t.review.backHome}
        </Link>
      </div>
    )
  }

  const isExplain = item.card.kind === 'explain'
  const suggested = grading.result ? GRADES.find((g) => g.grade === grading.result!.grade) : undefined

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col gap-4">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t.review.quit}
        </button>
        <div className="flex items-center gap-4">
          {mapTitle && <span className="max-w-32 truncate rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{mapTitle}</span>}
          {undoButton}
          <span className="text-sm tabular-nums text-slate-500">{retrying ? t.review.retryLeft(retry.length) : `${index + 1} / ${queue.length}`}</span>
        </div>
      </header>
      <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.min(1, index / queue.length) * 100}%` }} />
      </div>

      <article className="flex-1 space-y-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">{item.path.slice(0, -1).join(' › ')}</p>
          <Link to={`/maps/${item.node.mapId}?node=${item.node.id}`} className="shrink-0 text-sm text-indigo-600 dark:text-indigo-300">
            {t.mapReview.openMap}
          </Link>
        </div>
        <h2 className="flex items-start gap-2 text-xl font-bold">
          <span className="mt-2 size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="whitespace-pre-wrap">{item.node.title}</span>
        </h2>

        {revealed ? (
          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-500">{isExplain ? t.mapReview.definition : t.mapReview.branches}</p>
            {isExplain ? (
              <p className="leading-relaxed whitespace-pre-wrap">{item.node.definition}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {item.children.map((child, i) => (
                  <span key={i} className="rounded-full px-3 py-1 text-sm font-semibold text-white" style={{ background: child.color }}>
                    {child.title}
                  </span>
                ))}
              </div>
            )}
            {grading.result && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <ul className="space-y-1">
                  {grading.result.points.map((point, i) => (
                    <li key={i} className="flex gap-2">
                      <span className={`w-4 shrink-0 text-center font-bold ${MARKS[point.mark]?.className ?? ''}`}>{MARKS[point.mark]?.symbol ?? '・'}</span>
                      <span>{point.text}</span>
                    </li>
                  ))}
                </ul>
                {grading.result.comment && <p className="text-slate-600 dark:text-slate-300">{grading.result.comment}</p>}
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400">{isExplain ? t.mapReview.recallDefinition : t.mapReview.recallChildren(item.children.length)}</p>
            {!isExplain && (
              <div className="flex flex-wrap gap-1.5">
                {item.children.map((_, i) => (
                  <span key={i} className="rounded-full border-[1.5px] border-dashed px-4 py-1 text-sm text-slate-400" style={{ borderColor: item.color }}>
                    ？
                  </span>
                ))}
              </div>
            )}
            {!retrying && (
              <div className="space-y-2 pt-2">
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={3}
                  placeholder={t.mapReview.answerPlaceholder}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-950"
                />
                {answer.trim() && (
                  <button
                    onClick={grade}
                    disabled={grading.busy}
                    className="w-full rounded-xl border border-indigo-200 py-2.5 text-sm font-semibold text-indigo-600 disabled:opacity-50 dark:border-indigo-900 dark:text-indigo-300"
                  >
                    {grading.busy ? t.mapReview.grading : t.mapReview.grade}
                  </button>
                )}
                {grading.error && <p className="text-sm text-amber-600 dark:text-amber-400">{grading.error}</p>}
              </div>
            )}
          </>
        )}
      </article>

      <div className="pb-[env(safe-area-inset-bottom)]">
        {retrying && revealed ? (
          <>
            <p className="mb-2 text-center text-xs text-slate-500">{t.review.retryHint}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => answerRetry(false)} className="rounded-xl bg-rose-500 py-4 text-sm font-semibold text-white active:opacity-80">
                {t.review.stillForgot}
              </button>
              <button onClick={() => answerRetry(true)} className="rounded-xl bg-emerald-500 py-4 text-sm font-semibold text-white active:opacity-80">
                {t.review.gotIt}
              </button>
            </div>
          </>
        ) : outcomes ? (
          <>
            {overdueDays(item.card.card) > 0 && (
              <p className="mb-1 text-center text-xs text-amber-600 dark:text-amber-400">{t.review.overdue(overdueDays(item.card.card))}</p>
            )}
            <p className="mb-2 text-center text-xs text-slate-500">{suggested ? t.mapReview.suggested(t.grades[suggested.key]) : t.review.howWell}</p>
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map(({ grade, key, color }) => (
                <button
                  key={grade}
                  disabled={saving}
                  onClick={() => rate(grade)}
                  className={`${color} flex flex-col items-center rounded-xl py-3 text-white active:opacity-80 ${
                    suggested?.grade === grade ? 'ring-4 ring-indigo-300 ring-offset-2 ring-offset-slate-100 dark:ring-indigo-700 dark:ring-offset-slate-950' : ''
                  }`}
                >
                  <span className="text-sm font-semibold">{t.grades[key]}</span>
                  <span className="text-xs opacity-90">{t.interval(outcomes[grade].card.scheduled_days)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <button onClick={() => setRevealed(true)} className="w-full rounded-xl bg-indigo-600 py-4 font-semibold text-white">
            {t.review.showAnswer}
          </button>
        )}
      </div>
    </div>
  )
}
