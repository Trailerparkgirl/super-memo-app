import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './db'

/** ログイン状態。確認中は undefined、ログインしていなければ null。 */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null>()
  useEffect(() => {
    // 監視を始めた直後にも、保存済みのログイン状態で1回呼ばれる
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}
