import { useEffect, useState } from 'react'

let version = 0
const listeners = new Set<() => void>()

/** データを書き換えたら呼ぶ。表示中の useData がすべて読み直す。 */
export function notifyChange() {
  version++
  listeners.forEach((listener) => listener())
}

// 他の端末で書き換えたかもしれないので、アプリに戻ってきたら読み直す
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') notifyChange()
})

/**
 * データを読み込む。読み込み中は undefined。
 * deps が変わったときと notifyChange() のときに読み直す。
 * 失敗したら描画時に例外を投げ、ErrorBoundary で表示する。
 */
export function useData<T>(load: () => Promise<T>, deps: unknown[]): T | undefined {
  const [current, setCurrent] = useState(version)
  const [state, setState] = useState<{ key: string; data?: T; error?: unknown }>()
  const key = JSON.stringify(deps)

  useEffect(() => {
    const listener = () => setCurrent(version)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => !cancelled && setState({ key, data }),
      (error: unknown) => !cancelled && setState({ key, error }),
    )
    return () => {
      cancelled = true
    }
    // load は毎回作り直される関数なので deps で判断する
  }, [key, current]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state?.error) throw state.error
  // 条件が変わった直後は、前の条件の結果を返さない
  return state?.key === key ? state.data : undefined
}
