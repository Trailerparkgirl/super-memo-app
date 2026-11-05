import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type Grade,
  type RecordLogItem,
} from 'ts-fsrs'

// 日単位で復習するメモアプリなので、分単位の短期ステップは使わない
const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    enable_short_term: false,
    enable_fuzz: true,
  }),
)

export const GRADES = [
  { grade: Rating.Again, key: 'again', color: 'bg-rose-500' },
  { grade: Rating.Hard, key: 'hard', color: 'bg-amber-500' },
  { grade: Rating.Good, key: 'good', color: 'bg-emerald-500' },
  { grade: Rating.Easy, key: 'easy', color: 'bg-sky-500' },
] as const satisfies { grade: Grade; key: string; color: string }[]

const DAY = 24 * 60 * 60 * 1000

/** 新しいメモのカード。忘却曲線に従い、最初の復習は翌日。 */
export function newCard(now = new Date()): Card {
  const card = createEmptyCard(now)
  card.due = new Date(now.getTime() + DAY)
  return card
}

/** 復習予定日を何日過ぎているか（過ぎていなければ0） */
export function overdueDays(card: Card, now = new Date()): number {
  return Math.max(0, -daysUntil(card.due.getTime(), now))
}

/**
 * 予定日に復習しなかった場合は次の復習を早める（最短でも翌日）。
 * FSRS は遅れて思い出せると間隔を長くするので、まず予定日に復習した場合の間隔に抑え、
 * そこから遅れた日数を引く。例: 予定日なら「Good」で13日後、3日遅れた → 10日後
 */
function shortenForDelay(item: RecordLogItem, onTimeDays: number, overdue: number): RecordLogItem {
  const days = item.card.scheduled_days
  const shortened = Math.max(1, Math.min(days, onTimeDays) - overdue)
  if (shortened >= days) return item
  const due = new Date(item.card.due.getTime() - (days - shortened) * DAY)
  return { ...item, card: { ...item.card, scheduled_days: shortened, due } }
}

/** 4つの評価それぞれを選んだ場合の結果 */
export function preview(card: Card, now = new Date()): Record<Grade, RecordLogItem> {
  const result = scheduler.repeat(card, now)
  const grades = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const
  const overdue = overdueDays(card, now)
  if (overdue === 0) return Object.fromEntries(grades.map((g) => [g, result[g]])) as Record<Grade, RecordLogItem>

  const onTime = scheduler.repeat(card, card.due)
  return Object.fromEntries(
    grades.map((g) => [g, shortenForDelay(result[g], onTime[g].card.scheduled_days, overdue)]),
  ) as Record<Grade, RecordLogItem>
}

export function startOfDay(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfDay(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/** 復習予定日が今日から何日後か（今日以前なら0以下） */
export function daysUntil(due: number, now = new Date()): number {
  return Math.round((startOfDay(new Date(due)).getTime() - startOfDay(now).getTime()) / DAY)
}
