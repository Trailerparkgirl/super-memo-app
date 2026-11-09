import { startOfDay } from './scheduler'

/** この端末の時間帯での日付（YYYY-MM-DD）。review_days() の日付と同じ形 */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** 今日まで続けて復習した日数。今日まだ復習していなければ昨日までで数える（今日中に復習すれば途切れない） */
export function currentStreak(counts: Map<string, number>, now = new Date()): number {
  let day = startOfDay(now)
  if (!counts.has(dayKey(day))) day = addDays(day, -1)
  let streak = 0
  while (counts.has(dayKey(day))) {
    streak++
    day = addDays(day, -1)
  }
  return streak
}

/** これまでで一番長く続いた日数 */
export function longestStreak(counts: Map<string, number>): number {
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const key of [...counts.keys()].sort()) {
    // 'YYYY-MM-DDT00:00' はこの端末の時間帯の0時として読まれる
    run = previous && dayKey(addDays(new Date(`${previous}T00:00`), 1)) === key ? run + 1 : 1
    best = Math.max(best, run)
    previous = key
  }
  return best
}

/** 直近 weeks 週の日付を週ごとに並べる（日曜始まり）。今日より後の日は null */
export function calendarWeeks(weeks: number, now = new Date()): (Date | null)[][] {
  const start = addDays(startOfDay(now), -now.getDay() - (weeks - 1) * 7)
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(start, w * 7 + d)
      return day > now ? null : day
    }),
  )
}
