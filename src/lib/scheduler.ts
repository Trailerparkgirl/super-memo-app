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

/** 4つの評価それぞれを選んだ場合の結果 */
export function preview(card: Card, now = new Date()): Record<Grade, RecordLogItem> {
  const result = scheduler.repeat(card, now)
  return {
    [Rating.Again]: result[Rating.Again],
    [Rating.Hard]: result[Rating.Hard],
    [Rating.Good]: result[Rating.Good],
    [Rating.Easy]: result[Rating.Easy],
  } as Record<Grade, RecordLogItem>
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
