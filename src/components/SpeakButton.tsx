import { useI18n } from '../i18n'

/** 英単語を端末の音声で読み上げる。読み上げに対応していない端末では出さない。 */
export function SpeakButton({ text }: { text: string }) {
  const { t } = useI18n()
  if (!('speechSynthesis' in window)) return null

  function speak() {
    // 続けて押したときは、前の読み上げを止めてから読む
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    // 端末の言語が日本語でも英語の声で読むように、英語の声があれば選ぶ
    const voices = speechSynthesis.getVoices()
    const voice = voices.find((v) => v.lang.replace('_', '-') === 'en-US') ?? voices.find((v) => v.lang.startsWith('en'))
    if (voice) utterance.voice = voice
    utterance.rate = 0.9
    speechSynthesis.speak(utterance)
  }

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={t.flash.listen}
      title={t.flash.listen}
      className="ml-2 inline-grid size-9 place-items-center rounded-full bg-indigo-50 align-middle text-lg dark:bg-indigo-950"
    >
      🔊
    </button>
  )
}
