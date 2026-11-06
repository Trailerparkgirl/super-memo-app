import { atom, useAtomValue } from 'jotai'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './db'

/** ログイン状態。確認中は undefined、ログインしていなければ null。 */
const sessionAtom = atom<Session | null | undefined>(undefined)

// 使われている間だけ監視する。監視を始めた直後にも、保存済みのログイン状態で1回呼ばれる
sessionAtom.onMount = (set) => {
  const { data } = supabase.auth.onAuthStateChange((_event, next) => set(next))
  return () => data.subscription.unsubscribe()
}

export function useSession(): Session | null | undefined {
  return useAtomValue(sessionAtom)
}
