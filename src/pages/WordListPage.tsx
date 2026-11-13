import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { StudyLangPicker } from '../components/StudyLangPicker'
import { useI18n } from '../i18n'
import { PROFILES, studyFilterAtom } from '../lib/languages'
import { listMemos } from '../lib/memos'
import { daysUntil } from '../lib/scheduler'
import { useData } from '../lib/useData'
import { useToday } from '../lib/useNow'

/** 単語タブ。単語の復習・フラッシュカード・単語の追加と、単語の一覧 */
export function WordListPage() {
  const { t } = useI18n()
  useToday() // 日付が変わったら「今日」「明日」の表示を更新する
  const [search, setSearch] = useState('')
  const allMemos = useData(listMemos, [])
  const filter = useAtomValue(studyFilterAtom)
  const words = allMemos?.filter((m) => m.type === 'word' && (filter === 'all' || m.lang === filter))
  const due = words?.filter((m) => daysUntil(m.due) <= 0).length ?? 0

  const keyword = search.trim().toLowerCase()
  const filtered = words?.filter((m) => !keyword || [m.title, m.body, ...m.tags].some((s) => s.toLowerCase().includes(keyword)))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.words.title}</h1>
        <Link to="/words/new" className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          {t.words.add}
        </Link>
      </div>
      <StudyLangPicker />

      <div className="grid grid-cols-2 gap-2">
        {due > 0 ? (
          <Link to="/words/review" className="rounded-xl bg-indigo-600 py-3 text-center text-sm font-semibold text-white">
            {t.words.review(due)}
          </Link>
        ) : (
          <p className="rounded-xl bg-white py-3 text-center text-sm text-slate-500 shadow-sm dark:bg-slate-900">{t.words.noReview}</p>
        )}
        <Link to="/flash" className="rounded-xl border border-indigo-200 bg-white py-3 text-center text-sm font-semibold text-indigo-600 dark:border-indigo-900 dark:bg-slate-900 dark:text-indigo-300">
          {t.words.flash}
        </Link>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t.words.search}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900"
      />

      {filtered?.length === 0 && <p className="py-10 text-center text-sm text-slate-500">{words?.length ? t.words.notFound : t.words.empty}</p>}

      <ul className="space-y-2">
        {filtered?.map((m) => {
          const days = daysUntil(m.due)
          return (
            <li key={m.id}>
              <Link to={`/words/${m.id}`} className="block rounded-xl bg-white p-4 shadow-sm active:bg-slate-50 dark:bg-slate-900 dark:active:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 font-semibold">{m.title}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                      days <= 0
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {days <= 0 ? t.words.dueToday : t.daysFromNow(days)}
                  </span>
                </div>
                {m.body && <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">{m.body}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                  {filter === 'all' && <span>{PROFILES[m.lang].flag}</span>}
                  {m.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                  <span className="ml-auto">{t.words.reps(m.card.reps)}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
