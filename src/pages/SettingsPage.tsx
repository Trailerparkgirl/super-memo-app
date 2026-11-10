import { useEffect, useRef, useState } from 'react'
import { LANGUAGES, useI18n } from '../i18n'
import { supabase } from '../lib/db'
import { exportBackup, importBackup, InvalidBackupError } from '../lib/memos'
import { disableReminder, enableReminder, getReminderHour, NotificationDeniedError, reminderConfigured, reminderSupported } from '../lib/reminder'
import {
  englishVoices,
  getGender,
  getUseRecordings,
  getVoiceUri,
  setGender,
  setUseRecordings,
  setVoiceUri,
  speak,
  speechSupported,
  type VoiceGender,
} from '../lib/speech'
import { useSession } from '../lib/useSession'

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

const card = 'space-y-3 rounded-2xl bg-white p-5 text-sm shadow-sm dark:bg-slate-900'
const button = 'w-full rounded-xl border border-slate-200 py-2.5 font-medium dark:border-slate-700'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
// はじめて通知をオンにしたときの時刻
const DEFAULT_HOUR = 20

/** 毎日決まった時刻に「今日の復習」を通知する */
function ReminderSection() {
  const { t, lang } = useI18n()
  // 読み込み中は undefined、通知していなければ null
  const [hour, setHour] = useState<number | null | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!reminderConfigured || !reminderSupported) return
    getReminderHour().then(setHour, (e: unknown) => {
      console.error(e)
      setHour(null)
    })
  }, [])

  // 言語を切り替えたら、通知の言語も合わせる
  useEffect(() => {
    if (typeof hour === 'number') enableReminder(hour, lang).catch(console.error)
  }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  async function change(task: () => Promise<void>, next: number | null) {
    setBusy(true)
    setMessage('')
    try {
      await task()
      setHour(next)
    } catch (e) {
      console.error(e)
      setMessage(e instanceof NotificationDeniedError ? t.settings.reminderDenied : t.common.saveFailed)
    } finally {
      setBusy(false)
    }
  }

  if (!reminderConfigured) return null

  return (
    <section className={card}>
      <h2 className="font-semibold">{t.settings.reminderTitle}</h2>
      <p className="leading-relaxed text-slate-600 dark:text-slate-300">{t.settings.reminderBody}</p>
      {!reminderSupported ? (
        <p className="text-amber-600 dark:text-amber-400">{t.settings.reminderUnsupported}</p>
      ) : hour === undefined ? null : hour === null ? (
        <button onClick={() => change(() => enableReminder(DEFAULT_HOUR, lang), DEFAULT_HOUR)} disabled={busy} className={button}>
          {t.settings.reminderOn}
        </button>
      ) : (
        <>
          <label className="flex items-center justify-between gap-3">
            <span>{t.settings.reminderTime}</span>
            <select
              value={hour}
              disabled={busy}
              onChange={(e) => {
                const next = Number(e.target.value)
                change(() => enableReminder(next, lang), next)
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {`${h}:00`}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => change(disableReminder, null)} disabled={busy} className={button}>
            {t.settings.reminderOff}
          </button>
        </>
      )}
      {message && <p className="text-rose-600 dark:text-rose-400">{message}</p>}
    </section>
  )
}

/** 🔊 ボタンで読み上げる声を選ぶ（声は端末ごとに違うので、この端末に保存する） */
function VoiceSection() {
  const { t } = useI18n()
  const [voices, setVoices] = useState(englishVoices)
  const [gender, setGenderState] = useState(getGender)
  const [voiceUri, setVoiceUriState] = useState(getVoiceUri)
  const [useRecordings, setUseRecordingsState] = useState(getUseRecordings)

  // 声の一覧は後から読み込まれることがある
  useEffect(() => {
    if (!speechSupported) return
    const update = () => setVoices(englishVoices())
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])

  const choices = voices.filter((v) => !gender || v.gender === gender)

  function chooseGender(next: VoiceGender | null) {
    setGenderState(next)
    setGender(next)
    // 性別を変えたら、その中で一番よい声に戻す
    setVoiceUriState(null)
    setVoiceUri(null)
  }

  function chooseVoice(uri: string | null) {
    setVoiceUriState(uri)
    setVoiceUri(uri)
  }

  function chooseRecordings(on: boolean) {
    setUseRecordingsState(on)
    setUseRecordings(on)
  }

  return (
    <section className={card}>
      <h2 className="font-semibold">{t.settings.voiceTitle}</h2>
      <p className="leading-relaxed text-slate-600 dark:text-slate-300">{t.settings.voiceBody}</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={useRecordings} onChange={(e) => chooseRecordings(e.target.checked)} className="size-4 accent-indigo-600" />
        {t.settings.useRecordings}
      </label>
      {!speechSupported ? (
        <p className="text-amber-600 dark:text-amber-400">{t.settings.voiceUnsupported}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
            {(
              [
                [null, t.settings.voiceAuto],
                ['female', t.settings.female],
                ['male', t.settings.male],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                onClick={() => chooseGender(value)}
                className={`rounded-lg py-2 ${gender === value ? 'bg-white font-semibold shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {choices.length > 0 ? (
            <select
              value={choices.some((v) => v.voice.voiceURI === voiceUri) ? (voiceUri ?? '') : ''}
              onChange={(e) => chooseVoice(e.target.value || null)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">{t.settings.voiceBest}</option>
              {choices.map(({ voice }) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {`${voice.name} (${voice.lang})`}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-amber-600 dark:text-amber-400">{t.settings.noVoiceForGender}</p>
          )}
          <button onClick={() => speak(t.settings.voiceSample)} className={button}>
            {t.settings.voiceTest}
          </button>
          <p className="text-xs leading-relaxed text-slate-500">{t.settings.voiceTip}</p>
        </>
      )}
    </section>
  )
}

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

      <ReminderSection />

      <VoiceSection />

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

      <p className="text-center text-xs text-slate-400">
        {t.appName} v{__APP_VERSION__}
      </p>
    </div>
  )
}

