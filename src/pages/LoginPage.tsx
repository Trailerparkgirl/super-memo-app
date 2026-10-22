import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/db'

export function LoginPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  async function login(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    // 成功したら useSession が気づいて画面が切り替わる
    if (error) {
      setMessage(error.code === 'invalid_credentials' ? t.login.wrongPassword : t.login.failed)
      setSending(false)
    }
  }

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900'

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <form onSubmit={login} className="space-y-4">
        <h1 className="text-center text-2xl font-bold">{t.appName}</h1>
        <label className="block space-y-1">
          <span className="text-sm text-slate-600 dark:text-slate-300">{t.login.email}</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-slate-600 dark:text-slate-300">{t.login.password}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {message && <p className="text-sm text-rose-600 dark:text-rose-400">{message}</p>}
        <button type="submit" disabled={sending} className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white disabled:opacity-40">
          {t.login.submit}
        </button>
      </form>
    </div>
  )
}
