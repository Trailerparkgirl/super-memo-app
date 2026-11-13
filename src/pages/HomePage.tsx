import { useAtomValue } from 'jotai'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { calendarWeeks, currentStreak, dayKey, longestStreak } from '../lib/activity'
import { PROFILES, studyFilterAtom } from '../lib/languages'
import { dueReviewItems } from '../lib/mapReview'
import { loadLibrary } from '../lib/maps'
import { countDueMemos, countReviewsSince, listDueDates, reviewDayCounts } from '../lib/memos'
import { endOfDay, retrievability, startOfDay } from '../lib/scheduler'
import { buildTree } from '../lib/tree'
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

/** 思い出せる確率ごとの色（高いほど晴れ） */
function memoryColor(memory: number): string {
  if (memory >= 0.8) return 'bg-emerald-500'
  if (memory >= 0.6) return 'bg-amber-500'
  return 'bg-slate-400'
}

export function HomePage() {
  const { t, lang } = useI18n()
  const today = useToday()
  // 単語の件数は、単語タブで選んでいる言語だけ
  const filter = useAtomValue(studyFilterAtom)

  const stats = useData(async () => {
    const now = new Date()
    // 明日から7日間の復習予定
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() + i + 1)
      return d
    })
    const [library, wordsDue, reviewedToday, wordDates, activity] = await Promise.all([
      loadLibrary(),
      countDueMemos(now, filter),
      countReviewsSince(startOfDay(now)),
      listDueDates(startOfDay(days[0]), endOfDay(days[6]), filter),
      // review_days は後から追加した関数なので、データベースが古くてもホームは表示する（カレンダーだけ出さない）
      reviewDayCounts().catch((e: unknown) => {
        console.error(e)
        return null
      }),
    ])
    const tree = buildTree(library.nodes)
    const due = dueReviewItems(library, t.maps.inbox, now)
    const titleOf = (mapId: string) => tree.center(mapId)?.title ?? ''
    const inboxMap = library.maps.find((m) => m.kind === 'inbox')
    const inboxCenter = inboxMap && tree.center(inboxMap.id)

    // マップごとの今日の件数と、思い出せる確率の平均
    const byMap = new Map<string, number>()
    for (const item of due) byMap.set(item.node.mapId, (byMap.get(item.node.mapId) ?? 0) + 1)
    const mapOfNode = new Map(library.nodes.map((n) => [n.id, n.mapId]))
    const weather = library.maps
      .filter((m) => m.kind === 'map')
      .map((m) => {
        const values = library.cards.filter((c) => mapOfNode.get(c.nodeId) === m.id).flatMap((c) => retrievability(c.card, now) ?? [])
        return { id: m.id, title: titleOf(m.id), memory: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
      })
      .filter((w): w is { id: string; title: string; memory: number } => w.memory !== null)
      .sort((a, b) => a.memory - b.memory)

    const upcoming = [...library.cards.map((c) => c.due), ...wordDates]
    const forecast = days.map((d) => ({
      date: d,
      count: upcoming.filter((when) => startOfDay(new Date(when)).getTime() === startOfDay(d).getTime()).length,
    }))

    const calendar = calendarWeeks(CALENDAR_WEEKS, now)
    const streak = activity ? currentStreak(activity, now) : 0
    // 連続記録があって今日まだ復習していなければ、続けるよう促す
    const streakAtRisk = streak > 0 && !activity?.has(dayKey(now))

    return {
      dueCount: due.length,
      dueByMap: [...byMap].map(([id, count]) => ({ id, count, title: inboxMap?.id === id ? t.maps.inbox : titleOf(id) })),
      wordsDue,
      totalCards: library.cards.length,
      hasMaps: library.maps.some((m) => m.kind === 'map'),
      inbox: inboxMap && inboxCenter ? { id: inboxMap.id, items: tree.children(inboxCenter.id) } : null,
      weather,
      reviewedToday,
      forecast,
      activity,
      calendar,
      streak,
      streakAtRisk,
    }
  }, [today, filter, lang])

  const header = (
    <header>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {new Date(today).toLocaleDateString(t.locale, { month: 'long', day: 'numeric', weekday: 'short' })}
      </p>
      <h1 className="text-2xl font-bold">{t.appName}</h1>
    </header>
  )

  if (!stats) return <div className="space-y-5">{header}</div>
  const { activity } = stats
  const max = Math.max(1, ...stats.forecast.map((f) => f.count))
  const isNew = !stats.hasMaps && stats.totalCards === 0 && stats.wordsDue === 0 && !activity?.size

  return (
    <div className="space-y-5">
      {header}

      {isNew ? (
        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <h2 className="text-lg font-semibold">{t.home.welcomeTitle}</h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t.home.welcomeBody1}</p>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t.home.welcomeBody2}</p>
          <Link to="/maps?new=1" className="block rounded-xl bg-indigo-600 py-3 text-center font-semibold text-white">
            {t.home.firstMap}
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
              {stats.dueByMap.length > 1 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{t.home.byMap}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.dueByMap.map(({ id, title, count }) => (
                      <Link key={id} to={`/review?map=${id}`} className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        {title} <span className="tabular-nums opacity-70">{count}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{stats.reviewedToday > 0 ? t.home.allDone : t.home.noneToday}</p>
          )}
          {stats.wordsDue > 0 && (
            <Link
              to="/words/review"
              className="mt-3 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold dark:bg-slate-800"
            >
              <span>
                {t.home.wordReview} {filter !== 'all' && PROFILES[filter].flag}
              </span>
              <span className="tabular-nums">
                {stats.wordsDue}
                {t.home.countUnit} ›
              </span>
            </Link>
          )}
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t.home.stats(stats.reviewedToday, stats.totalCards)}</p>
        </section>
      )}

      {stats.inbox && stats.inbox.items.length > 0 && (
        <section className="space-y-2 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{t.home.inbox}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t.home.inboxBody(stats.inbox.items.length)}</p>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {stats.inbox.items.slice(-3).map((item) => (
              <li key={item.id} className="truncate py-1.5">
                {item.title}
              </li>
            ))}
          </ul>
          <Link to={`/maps/${stats.inbox.id}`} className="block rounded-xl border border-indigo-200 py-2.5 text-center text-sm font-semibold text-indigo-600 dark:border-indigo-900 dark:text-indigo-300">
            {t.home.organize}
          </Link>
        </section>
      )}

      {stats.weather.length > 0 && (
        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div>
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{t.home.weather}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.home.weatherHint}</p>
          </div>
          {stats.weather.map((w) => (
            <Link key={w.id} to={`/maps/${w.id}`} className="grid grid-cols-[minmax(0,7rem)_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate">{w.title}</span>
              <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <span className={`block h-full rounded-full ${memoryColor(w.memory)}`} style={{ width: `${Math.round(w.memory * 100)}%` }} />
              </span>
              <span className="text-right text-xs text-slate-500 tabular-nums">{Math.round(w.memory * 100)}%</span>
            </Link>
          ))}
        </section>
      )}

      {!isNew && activity && (
        <section className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{t.home.activity}</h2>
            <p className="text-sm font-semibold">{t.home.streak(stats.streak)}</p>
          </div>
          <div className="flex gap-[3px]">
            {stats.calendar.map((week, i) => (
              <div key={i} className="flex flex-1 flex-col gap-[3px]">
                {week.map((day, j) => {
                  const count = day ? (activity.get(dayKey(day)) ?? 0) : 0
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
            {stats.streakAtRisk ? t.home.keepStreak : t.home.longestStreak(longestStreak(activity))}
          </p>
        </section>
      )}

      {!isNew && (
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
