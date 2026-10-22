import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { countDueMemos, countMemos, countReviewsSince, listDueDates } from '../lib/memos'
import { endOfDay, startOfDay } from '../lib/scheduler'
import { useData } from '../lib/useData'
import { useToday } from '../lib/useNow'

export function HomePage() {
  const { t } = useI18n()
  const today = useToday()

  const stats = useData(async () => {
    const now = new Date()
    // 明日から7日間の復習予定
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() + i + 1)
      return d
    })
    const [dueCount, total, reviewedToday, upcoming] = await Promise.all([
      countDueMemos(now),
      countMemos(),
      countReviewsSince(startOfDay(now)),
      listDueDates(startOfDay(days[0]), endOfDay(days[6])),
    ])
    const forecast = days.map((d) => ({
      date: d,
      count: upcoming.filter((due) => startOfDay(new Date(due)).getTime() === startOfDay(d).getTime()).length,
    }))

    return { dueCount, total, reviewedToday, forecast }
  }, [today])

  if (!stats) return null
  const max = Math.max(1, ...stats.forecast.map((f) => f.count))

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {new Date(today).toLocaleDateString(t.locale, { month: 'long', day: 'numeric', weekday: 'short' })}
        </p>
        <h1 className="text-2xl font-bold">{t.appName}</h1>
      </header>

      {stats.total === 0 ? (
        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <h2 className="text-lg font-semibold">{t.home.welcomeTitle}</h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t.home.welcomeBody1}</p>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t.home.welcomeBody2}</p>
          <Link to="/memos/new" className="block rounded-xl bg-indigo-600 py-3 text-center font-semibold text-white">
            {t.home.writeFirstMemo}
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t.home.todaysReview}</p>
          <p className="mt-1 text-5xl font-bold tabular-nums">
            {stats.dueCount}
            <span className="ml-1 text-lg font-medium text-slate-500">{t.home.countUnit}</span>
          </p>
          {stats.dueCount > 0 ? (
            <Link to="/review" className="mt-4 block rounded-xl bg-indigo-600 py-3 text-center font-semibold text-white">
              {t.home.startReview}
            </Link>
          ) : (
            <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">
              {stats.reviewedToday > 0 ? t.home.allDone : t.home.noneToday}
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t.home.stats(stats.reviewedToday, stats.total)}</p>
        </section>
      )}

      {stats.total > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{t.home.upcoming}</h2>
          {stats.forecast.every((f) => f.count === 0) && <p className="mb-2 text-xs text-slate-500">{t.home.noUpcoming}</p>}
          <div className="flex h-32 items-end gap-2">
            {stats.forecast.map(({ date, count }) => (
              <div key={date.toDateString()} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs tabular-nums text-slate-500">{count || ''}</span>
                <div
                  className="w-full rounded-t-md bg-indigo-400 dark:bg-indigo-500"
                  style={{ height: `${(count / max) * 80}px`, minHeight: count ? 4 : 0 }}
                />
                <span className="text-center text-[11px] text-slate-500">
                  {date.getDate()}
                  <br />
                  {date.toLocaleDateString(t.locale, { weekday: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
