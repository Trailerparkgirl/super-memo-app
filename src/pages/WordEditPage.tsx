import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Rating } from 'ts-fsrs'
import { LangTabs } from '../components/StudyLangPicker'
import { useI18n } from '../i18n'
import { type Memo } from '../lib/db'
import { defaultLang, PROFILES, studyFilterAtom } from '../lib/languages'
import { createMemo, deleteMemo, getMemo, listLogs, parseTags, resetMemo, updateMemo } from '../lib/memos'
import { daysUntil, GRADES } from '../lib/scheduler'
import { unsavedChangesAtom } from '../lib/unsaved'
import { useData } from '../lib/useData'

export function WordEditPage() {
  const { id } = useParams()
  // 読み込み中は undefined、存在しない単語は null
  const memo = useData(async () => (id ? getMemo(id) : null), [id])
  if (id && memo === undefined) return null
  // 単語が切り替わったらフォームを作り直して内容を読み込む
  return <WordForm key={memo?.id ?? 'new'} memo={memo ?? undefined} />
}

function WordForm({ memo }: { memo?: Memo }) {
  const { t } = useI18n()
  const id = memo?.id
  const navigate = useNavigate()
  const logs = useData(async () => (id ? listLogs(id) : []), [id])
  // 新しいメモは、いま選んでいる言語にする
  const filter = useAtomValue(studyFilterAtom)

  // 開いたとき（続けて追加したときは保存した直後）の内容。これと違えば、保存していない変更がある
  const [initial, setInitial] = useState(() => ({
    lang: memo?.lang ?? defaultLang(filter),
    title: memo?.title ?? '',
    body: memo?.body ?? '',
    tags: memo?.tags.join(' ') ?? '',
  }))
  const [lang, setLang] = useState(initial.lang)
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [tags, setTags] = useState(initial.tags)
  // 通信中に二度押しして同じメモが2つできないようにする
  const [busy, setBusy] = useState(false)
  // 「保存して続けて追加」で最後に保存したもの（保存できたことを知らせる）
  const [added, setAdded] = useState<string | null>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  // 新しい単語で言語を切り替えただけなら、失うものはないので聞かない
  const dirty =
    title !== initial.title || body !== initial.body || tags !== initial.tags || (!!id && lang !== initial.lang)
  const setUnsaved = useSetAtom(unsavedChangesAtom)
  useEffect(() => {
    setUnsaved(dirty)
    if (!dirty) return
    // 再読み込みやタブを閉じるときはブラウザが確認する
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      setUnsaved(false)
    }
  }, [dirty, setUnsaved])

  function back() {
    if (dirty && !confirm(t.edit.confirmDiscard)) return
    navigate(-1)
  }

  const canSave = title.trim() !== '' && body.trim() !== '' && !busy
  const listPath = '/words'

  const fields = {
    title: t.edit.word,
    body: t.edit.meaning,
    titleRows: 1,
    bodyRows: 3,
    titlePlaceholder: t.edit.wordPlaceholder(PROFILES[lang].sample),
    bodyPlaceholder: t.edit.meaningPlaceholder,
  }

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
    const input = { type: 'word' as const, lang, title: title.trim(), body: body.trim(), tags: parseTags(tags) }
    if (await write(() => (id ? updateMemo(id, input) : createMemo(input)))) navigate(listPath)
  }

  /** 新しい単語を保存して、言語とタグはそのままに次の単語を書き始める */
  async function saveAndAdd() {
    if (id || !canSave) return
    const input = { type: 'word' as const, lang, title: title.trim(), body: body.trim(), tags: parseTags(tags) }
    if (!(await write(() => createMemo(input)))) return
    setInitial({ lang, title: '', body: '', tags })
    setTitle('')
    setBody('')
    setAdded(input.title)
    titleRef.current?.focus()
  }

  async function remove() {
    if (!id || busy || !confirm(t.edit.confirmDelete)) return
    if (await write(() => deleteMemo(id))) navigate(listPath, { replace: true })
  }

  async function reset() {
    if (!id || busy || !confirm(t.edit.confirmReset)) return
    await write(() => resetMemo(id))
  }

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900'

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <button onClick={back} className="text-sm text-slate-500">
          {t.edit.back}
        </button>
        <h1 className="font-bold">{id ? t.edit.titleEdit : t.edit.titleNew}</h1>
        <button onClick={save} disabled={!canSave} className="font-semibold text-indigo-600 disabled:text-slate-400 dark:text-indigo-400">
          {t.edit.save}
        </button>
      </header>

      <div className="space-y-1">
        <span className="text-sm text-slate-600 dark:text-slate-300">{t.edit.language}</span>
        <LangTabs value={lang} onChange={setLang} />
      </div>

      {added && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t.edit.added(added)}</p>}

      <label className="block space-y-1">
        <span className="text-sm text-slate-600 dark:text-slate-300">{fields.title}</span>
        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={fields.titleRows}
          placeholder={fields.titlePlaceholder}
          className={inputClass}
          autoFocus={!id}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-slate-600 dark:text-slate-300">{fields.body}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={fields.bodyRows}
          placeholder={fields.bodyPlaceholder}
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

      {!id && (
        <button
          onClick={saveAndAdd}
          disabled={!canSave}
          className="w-full rounded-xl border border-indigo-200 py-3 font-semibold text-indigo-600 disabled:opacity-40 dark:border-indigo-900 dark:text-indigo-300"
        >
          {t.edit.saveAndAdd}
        </button>
      )}

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
