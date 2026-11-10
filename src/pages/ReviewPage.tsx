import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Rating, type Grade } from 'ts-fsrs'
import { SpeakButton } from '../components/SpeakButton'
import { WordTools } from '../components/WordTools'
import { useI18n } from '../i18n'
import { type Memo } from '../lib/db'
import { PROFILES, studyFilterAtom } from '../lib/languages'
import { deleteMemo, listDueMemos, recordReview, undoReview, updateMemo } from '../lib/memos'
import { GRADES, overdueDays, preview } from '../lib/scheduler'

// しばらく空いて復習がたまったら（BACKLOG 件より多いとき）、BATCH 件ずつ進められるようにする
const BACKLOG = 30
const BATCH = 20

export function ReviewPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  // ホームでタグを選んだときは ?tag=英語 のように、そのタグのメモだけ復習する
  const tag = useSearchParams()[0].get('tag') ?? undefined
  // ホームで選んでいる言語のメモだけ
  const filter = useAtomValue(studyFilterAtom)
  // 開始時点の復習対象を固定する（途中で一覧が変わらないように）
  const [queue, setQueue] = useState<Memo[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<unknown>()
  // 復習中に間違いに気づいたら、その場で直せる
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null)
  // 押し間違えたら、直前の評価を取り消せる
  const [lastLogId, setLastLogId] = useState<number | null>(null)
  // 「忘れてた」にしたメモは、最後にもう一度出して覚え直す（練習なので次の復習日は変えない）
  const [retry, setRetry] = useState<Memo[]>([])
  // たまっているときは、全部やるか少しずつやるかを先に選んでもらう
  const [pending, setPending] = useState<Memo[] | null>(null)
  // 少しずつやる場合の、まだ出していないメモ（予定日は変えないので、明日以降も復習対象のまま残る）
  const [backlog, setBacklog] = useState<Memo[]>([])

  useEffect(() => {
    listDueMemos(new Date(), tag, filter).then((list) => (list.length > BACKLOG ? setPending(list) : setQueue(list)), setLoadError)
  }, [tag, filter])

  function start(all: Memo[], count: number) {
    setQueue(all.slice(0, count))
    setBacklog(all.slice(count))
    setPending(null)
  }

  /** 終わったあとに、残りから次の BATCH 件を続けて出す */
  function continueBacklog() {
    setQueue((list) => [...(list ?? []), ...backlog.slice(0, BATCH)])
    setBacklog((list) => list.slice(BATCH))
  }

  const retrying = !!queue && index >= queue.length
  const memo = retrying ? retry[0] : queue?.[index]
  const outcomes = useMemo(() => (memo && revealed && !retrying ? preview(memo.card) : null), [memo, revealed, retrying])

  async function saveEdit() {
    if (!memo || !draft || saving) return
    const title = draft.title.trim()
    const body = draft.body.trim()
    if (!title) return
    setSaving(true)
    try {
      await updateMemo(memo.id, { type: memo.type, lang: memo.lang, title, body, tags: memo.tags })
    } catch (e) {
      // 入力した内容のまま、もう一度保存できる
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    const edit = (m: Memo) => (m.id === memo.id ? { ...m, title, body } : m)
    setQueue((list) => list?.map(edit) ?? null)
    setRetry((list) => list.map(edit))
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
    setRetry((list) => list.filter((m) => m.id !== memo.id))
    if (retrying) {
      // 覚え直し中は一覧の最後の次を指したままにする。消したのは評価済みのメモなので取り消しもできなくなる
      setIndex((i) => i - 1)
      setLastLogId(null)
    }
    setDraft(null)
    setRevealed(false)
  }

  async function rate(grade: Grade) {
    if (!memo || !outcomes || saving || retrying) return
    setSaving(true)
    let logId: number
    try {
      logId = await recordReview(memo, grade, outcomes[grade])
    } catch (e) {
      // 同じカードのまま、もう一度評価できる
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    setLastLogId(logId)
    if (grade === Rating.Again) setRetry((list) => [...list, memo])
    setRevealed(false)
    setDraft(null)
    setIndex((i) => i + 1)
  }

  /** 覚え直し：思い出せたら終わり、まだ忘れていたら最後に回す */
  function answerRetry(remembered: boolean) {
    setRetry(([first, ...rest]) => (remembered ? rest : [...rest, first]))
    setLastLogId(null)
    setRevealed(false)
    setDraft(null)
  }

  async function undo() {
    // 一覧のメモは評価しても書き換えていないので、評価する前のカードのまま
    const previous = queue?.[index - 1]
    if (!previous || lastLogId === null || saving) return
    setSaving(true)
    try {
      await undoReview(previous.id, lastLogId, previous.card)
    } catch (e) {
      console.error(e)
      alert(t.common.saveFailed)
      return
    } finally {
      setSaving(false)
    }
    // 答えを出したまま戻るので、すぐに評価し直せる
    setRetry((list) => list.filter((m) => m.id !== previous.id))
    setLastLogId(null)
    setDraft(null)
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

  if (!memo) {
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
        <div className="flex items-center gap-4">
          {tag && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">#{tag}</span>}
          {undoButton}
          <span className="text-sm tabular-nums text-slate-500">
            {retrying ? t.review.retryLeft(retry.length) : `${index + 1} / ${queue.length}`}
          </span>
        </div>
      </header>
      <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.min(1, index / queue.length) * 100}%` }} />
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
              {/* すべての言語をまとめて復習しているときは、どの言語か旗でわかるようにする */}
              {filter === 'all' && `${PROFILES[memo.lang].flag} `}
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
          <h2 className="text-xl font-bold whitespace-pre-wrap">
            {memo.title}
            {isWord && <SpeakButton text={memo.title.trim()} lang={memo.lang} />}
          </h2>

          {revealed ? (
            <>
              <div className="border-t border-slate-200 pt-4 whitespace-pre-wrap leading-relaxed dark:border-slate-700">
                {!isNote && <p className="mb-1 text-xs font-semibold text-slate-500">{isWord ? t.review.meaning : t.review.answer}</p>}
                {memo.body || <span className="text-slate-400">{t.review.noBody}</span>}
              </div>
              {isWord && <WordTools key={memo.id} word={memo.title.trim()} lang={memo.lang} />}
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isWord ? t.review.recallWord : isNote ? t.review.recallNote : t.review.recallQa}
            </p>
          )}
        </article>
      )}

      <div className="pb-[env(safe-area-inset-bottom)]">
        {draft ? null : retrying && revealed ? (
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
