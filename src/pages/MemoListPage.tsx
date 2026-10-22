import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { listMemos } from '../lib/memos'
import { daysUntil } from '../lib/scheduler'
import { useData } from '../lib/useData'
import { useToday } from '../lib/useNow'

export function MemoListPage() {
  const { t } = useI18n()
  useToday() // 日付が変わったら「今日」「明日」の表示を更新する
  const [search, setSearch] = useState('')
  const memos = useData(listMemos, [])

  const keyword = search.trim().toLowerCase()
  const filtered = memos?.filter(
    (m) => !keyword || [m.title, m.body, ...m.tags].some((s) => s.toLowerCase().includes(keyword)),
  )

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.list.title}</h1>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t.list.search}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900"
      />

      {filtered?.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">{memos?.length ? t.list.notFound : t.list.empty}</p>
      )}

      <ul className="space-y-2">
        {filtered?.map((m) => {
          const days = daysUntil(m.due)
          return (
            <li key={m.id}>
              <Link to={`/memos/${m.id}`} className="block rounded-xl bg-white p-4 shadow-sm active:bg-slate-50 dark:bg-slate-900 dark:active:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 font-semibold">{m.title}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                      days <= 0
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {days <= 0 ? t.list.dueToday : t.daysFromNow(days)}
                  </span>
                </div>
                {m.body && (
                  <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">
                    {m.type === 'qa' ? t.list.answerPrefix : ''}
                    {m.body}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                  <span>{t.memoType[m.type]}</span>
                  {m.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                  <span className="ml-auto">{t.list.reps(m.card.reps)}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
