import { useRef, useState } from 'react'
import { LANGUAGES, useI18n } from '../i18n'
import { supabase } from '../lib/db'
import { exportBackup, importBackup, InvalidBackupError } from '../lib/memos'
import { useSession } from '../lib/useSession'

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function SettingsPage() {
  const { t, lang, setLang } = useI18n()
  const session = useSession()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  async function download() {
    let blob: Blob
    try {
      blob = await exportBackup()
    } catch (e) {
      console.error(e)
      setMessage(t.common.loadFailed)
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `super-memo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function upload(file: File) {
    try {
      const count = await importBackup(file)
      setMessage(t.settings.imported(count))
    } catch (e) {
      setMessage(e instanceof InvalidBackupError ? t.settings.invalidBackup : t.settings.importFailed)
    }
  }

  const card = 'space-y-3 rounded-2xl bg-white p-5 text-sm shadow-sm dark:bg-slate-900'
  const button = 'w-full rounded-xl border border-slate-200 py-2.5 font-medium dark:border-slate-700'

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.settings.title}</h1>

      {!isStandalone && (
        <section className={`${card} border-2 border-indigo-200 dark:border-indigo-900`}>
          <h2 className="font-semibold">{t.settings.installTitle}</h2>
          <p className="leading-relaxed text-slate-600 dark:text-slate-300">{t.settings.installBody}</p>
        </section>
      )}

      <section className={card}>
        <h2 className="font-semibold">{t.settings.language}</h2>
        <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
          {LANGUAGES.map((option) => (
            <button
              key={option.lang}
              onClick={() => setLang(option.lang)}
              className={`rounded-lg py-2 ${lang === option.lang ? 'bg-white font-semibold shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">{t.settings.backupTitle}</h2>
        <p className="text-slate-600 dark:text-slate-300">{t.settings.backupBody}</p>
        <button onClick={download} className={button}>
          {t.settings.saveBackup}
        </button>
        <button onClick={() => fileInput.current?.click()} className={button}>
          {t.settings.restore}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload(file)
            e.target.value = ''
          }}
        />
        {message && <p className="text-indigo-600 dark:text-indigo-400">{message}</p>}
      </section>

      <section className={card}>
        <h2 className="font-semibold">{t.settings.accountTitle}</h2>
        {session?.user.email && <p className="text-slate-600 dark:text-slate-300">{t.settings.loggedInAs(session.user.email)}</p>}
        <button onClick={() => supabase.auth.signOut()} className={button}>
          {t.settings.logout}
        </button>
      </section>

      <section className={card}>
        <h2 className="font-semibold">{t.settings.howTitle}</h2>
        <p className="leading-relaxed text-slate-600 dark:text-slate-300">{t.settings.howBody}</p>
        <p className="text-xs text-slate-500">{t.settings.algorithm}</p>
      </section>
    </div>
  )
}
