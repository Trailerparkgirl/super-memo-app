import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { calendarWeeks, currentStreak, dayKey, longestStreak } from '../lib/activity'
import { countDueMemos, countMemos, countReviewsSince, listDueDates, listDueTags, reviewDayCounts } from '../lib/memos'
import { endOfDay, startOfDay } from '../lib/scheduler'
import { useData } from '../lib/useData'
import { useToday } from '../lib/useNow'

// 活動カレンダーに出す週の数（スマホの幅に収まるくらい）
const CALENDAR_WEEKS = 17

/** 復習した件数が多い日ほど濃くする */
function shade(count: number): string {
  if (count === 0) return 'bg-slate-100 dark:bg-slate-800'
  if (count < 5) return 'bg-indigo-200 dark:bg-indigo-900'
  if (count < 15) return 'bg-indigo-400 dark:bg-indigo-700'
  return 'bg-indigo-600 dark:bg-indigo-400'
}

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
    const [dueCount, total, reviewedToday, upcoming, activity, dueTags] = await Promise.all([
      countDueMemos(now),
      countMemos(),
      countReviewsSince(startOfDay(now)),
      listDueDates(startOfDay(days[0]), endOfDay(days[6])),
      reviewDayCounts(),
      listDueTags(now),
    ])
    const forecast = days.map((d) => ({
      date: d,
      count: upcoming.filter((due) => startOfDay(new Date(due)).getTime() === startOfDay(d).getTime()).length,
    }))

    const calendar = calendarWeeks(CALENDAR_WEEKS, now)
    const streak = currentStreak(activity, now)
    // 連続記録があって今日まだ復習していなければ、続けるよう促す
    const streakAtRisk = streak > 0 && !activity.has(dayKey(now))

    return { dueCount, total, reviewedToday, forecast, activity, calendar, streak, streakAtRisk, dueTags }
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
            <>
              <Link to="/review" className="mt-4 block rounded-xl bg-indigo-600 py-3 text-center font-semibold text-white">
                {t.home.startReview}
              </Link>
              {stats.dueTags.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{t.home.byTag}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.dueTags.map(([tag, count]) => (
                      <Link
                        key={tag}
                        to={`/review?tag=${encodeURIComponent(tag)}`}
                        className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      >
                        #{tag} <span className="tabular-nums opacity-70">{count}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
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
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{t.home.activity}</h2>
            <p className="text-sm font-semibold">{t.home.streak(stats.streak)}</p>
          </div>
          <div className="flex gap-[3px]">
            {stats.calendar.map((week, i) => (
              <div key={i} className="flex flex-1 flex-col gap-[3px]">
                {week.map((day, j) => {
                  const count = day ? (stats.activity.get(dayKey(day)) ?? 0) : 0
                  return (
                    <div
                      key={j}
                      title={day ? t.home.activityDay(day, count) : undefined}
                      className={`aspect-square rounded-[3px] ${day ? shade(count) : ''}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {stats.streakAtRisk ? t.home.keepStreak : t.home.longestStreak(longestStreak(stats.activity))}
          </p>
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
