import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { prepareRecording, pronounce, speechSupported } from '../lib/speech'

/** 英単語の発音を聞く。辞書に人の録音があればそれを、なければ端末の音声で読み上げる。 */
export function SpeakButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [recording, setRecording] = useState<{ text: string; url: string | null }>()

  useEffect(() => {
    let cancelled = false
    prepareRecording(text).then((url) => !cancelled && setRecording({ text, url }))
    return () => {
      cancelled = true
    }
  }, [text])

  // 単語を直した直後は、前の単語の録音を使わない
  const url = recording?.text === text ? recording.url : null
  if (!speechSupported && !url) return null

  return (
    <button
      type="button"
      onClick={() => pronounce(text, url)}
      aria-label={t.flash.listen}
      title={t.flash.listen}
      className="ml-2 inline-grid size-9 place-items-center rounded-full bg-indigo-50 align-middle text-lg dark:bg-indigo-950"
    >
      🔊
    </button>
  )
}
