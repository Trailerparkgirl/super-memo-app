import { useEffect, useState } from 'react'

/**
 * 現在時刻。アプリに戻ってきたときと1分ごとに更新する。
 * 日付が変わったら「今日の復習」を数え直すために使う。
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const update = () => setNow(new Date())
    const timer = setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return now
}

/** 今日の日付の文字列。日が変わったときだけ値が変わる。 */
export function useToday(): string {
  return useNow().toDateString()
}
