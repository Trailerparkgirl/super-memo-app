import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Rating } from 'ts-fsrs'
import { useI18n } from '../i18n'
import { type Memo, type MemoType } from '../lib/db'
import { createMemo, deleteMemo, getMemo, listLogs, parseTags, resetMemo, updateMemo } from '../lib/memos'
import { daysUntil, GRADES } from '../lib/scheduler'
import { useData } from '../lib/useData'

export function MemoEditPage() {
  const { id } = useParams()
  // 読み込み中は undefined、存在しないメモは null
  const memo = useData(async () => (id ? getMemo(id) : null), [id])
  if (id && memo === undefined) return null
  // メモが切り替わったらフォームを作り直して内容を読み込む
  return <MemoForm key={memo?.id ?? 'new'} memo={memo ?? undefined} />
}

function MemoForm({ memo }: { memo?: Memo }) {
  const { t } = useI18n()
  const id = memo?.id
  const navigate = useNavigate()
  const logs = useData(async () => (id ? listLogs(id) : []), [id])

  const [type, setType] = useState<MemoType>(memo?.type ?? 'note')
  const [title, setTitle] = useState(memo?.title ?? '')
  const [body, setBody] = useState(memo?.body ?? '')
  const [tags, setTags] = useState(memo?.tags.join(' ') ?? '')
  // 通信中に二度押しして同じメモが2つできないようにする
  const [busy, setBusy] = useState(false)

  const isQa = type === 'qa'
  const canSave = title.trim() !== '' && (!isQa || body.trim() !== '') && !busy

  /** 書き込みを1つずつ実行する。失敗したら知らせて false を返す。 */
  async function write(task: () => Promise<unknown>): Promise<boolean> {
    setBusy(true)
    try {
      await task()
      return true
    } catch (e) {
      console.error(e)
      alert(t.common.saveFailed)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!canSave) return
    const input = { type, title: title.trim(), body: body.trim(), tags: parseTags(tags) }
    if (await write(() => (id ? updateMemo(id, input) : createMemo(input)))) navigate('/memos')
  }

  async function remove() {
    if (!id || busy || !confirm(t.edit.confirmDelete)) return
    if (await write(() => deleteMemo(id))) navigate('/memos', { replace: true })
  }

  async function reset() {
    if (!id || busy || !confirm(t.edit.confirmReset)) return
    await write(() => resetMemo(id))
  }

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900'

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm text-slate-500">
          {t.edit.back}
        </button>
        <h1 className="font-bold">{id ? t.edit.titleEdit : t.edit.titleNew}</h1>
        <button onClick={save} disabled={!canSave} className="font-semibold text-indigo-600 disabled:text-slate-400 dark:text-indigo-400">
          {t.edit.save}
        </button>
      </header>

      <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1 text-sm dark:bg-slate-800">
        {(
          [
            ['note', t.edit.typeNote],
            ['qa', t.edit.typeQa],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setType(value)}
            className={`rounded-lg py-2 ${type === value ? 'bg-white font-semibold shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="block space-y-1">
        <span className="text-sm text-slate-600 dark:text-slate-300">{isQa ? t.edit.question : t.edit.title}</span>
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={isQa ? 3 : 1}
          placeholder={isQa ? t.edit.questionPlaceholder : t.edit.titlePlaceholder}
          className={inputClass}
          autoFocus={!id}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-slate-600 dark:text-slate-300">{isQa ? t.edit.answer : t.edit.content}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={isQa ? 4 : 10}
          placeholder={isQa ? t.edit.answerPlaceholder : t.edit.contentPlaceholder}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-slate-600 dark:text-slate-300">{t.edit.tags}</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t.edit.tagsPlaceholder} className={inputClass} />
      </label>

      <button onClick={save} disabled={!canSave} className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white disabled:opacity-40">
        {id ? t.edit.saveExisting : t.edit.saveNew}
      </button>

      {memo && (
        <section className="space-y-3 rounded-2xl bg-white p-4 text-sm shadow-sm dark:bg-slate-900">
          <h2 className="font-semibold">{t.edit.status}</h2>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-slate-500">{t.edit.nextReview}</dt>
              <dd className="font-semibold">{t.daysFromNow(daysUntil(memo.due))}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t.edit.reps}</dt>
              <dd className="font-semibold">{t.edit.times(memo.card.reps)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t.edit.lapses}</dt>
              <dd className="font-semibold">{t.edit.times(memo.card.lapses)}</dd>
            </div>
          </dl>
          {!!logs?.length && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((log) => {
                const grade = GRADES.find((g) => g.grade === log.rating)
                return (
                  <li key={log.id} className="flex items-center justify-between py-1.5">
                    <span className="text-slate-500">{log.reviewedAt.toLocaleDateString(t.locale)}</span>
                    <span className={log.rating === Rating.Again ? 'text-rose-500' : ''}>{grade && t.grades[grade.key]}</span>
                    <span className="text-slate-500">→ {t.interval(log.scheduledDays)}</span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-xs text-slate-500">
            {t.edit.createdAt}: {memo.createdAt.toLocaleDateString(t.locale)}
          </p>
          <div className="flex gap-2 pt-1">
            <button onClick={reset} className="flex-1 rounded-lg border border-slate-200 py-2 dark:border-slate-700">
              {t.edit.relearn}
            </button>
            <button onClick={remove} className="flex-1 rounded-lg border border-rose-200 py-2 text-rose-600 dark:border-rose-900">
              {t.edit.delete}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
