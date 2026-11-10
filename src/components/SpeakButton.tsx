import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { StudyLang } from '../lib/db'
import { prepareRecording, pronounce, speechSupported } from '../lib/speech'

/** 単語の発音を聞く。辞書に人の録音があればそれを、なければ端末のその言語の音声で読み上げる。 */
export function SpeakButton({ text, lang }: { text: string; lang: StudyLang }) {
  const { t } = useI18n()
  const [recording, setRecording] = useState<{ key: string; url: string | null }>()
  const key = `${lang}:${text}`

  useEffect(() => {
    let cancelled = false
    prepareRecording(text, lang).then((url) => !cancelled && setRecording({ key: `${lang}:${text}`, url }))
    return () => {
      cancelled = true
    }
  }, [text, lang])

  // 単語や言語を直した直後は、前の単語の録音を使わない
  const url = recording?.key === key ? recording.url : null
  if (!speechSupported && !url) return null

  return (
    <button
      type="button"
      onClick={() => pronounce(text, url, lang)}
      aria-label={t.flash.listen}
      title={t.flash.listen}
      className="ml-2 inline-grid size-9 place-items-center rounded-full bg-indigo-50 align-middle text-lg dark:bg-indigo-950"
    >
      🔊
    </button>
  )
}
