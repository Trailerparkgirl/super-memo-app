import type { StudyLang } from './db'
import { PROFILES } from './languages'
import { load, save } from './storage'

// ---- 発音の読み上げ ----

export type VoiceGender = 'female' | 'male'

export interface VoiceOption {
  voice: SpeechSynthesisVoice
  /** 名前からわかるときだけ（Web Speech API には性別の情報がない） */
  gender: VoiceGender | null
}

export const speechSupported = 'speechSynthesis' in window

const GENDER_KEY = 'super-memo:voice-gender'
const VOICE_KEY = 'super-memo:voice'
const RECORDINGS_KEY = 'super-memo:use-recordings'

export const getGender = (): VoiceGender | null => {
  const gender = load(GENDER_KEY)
  return gender === 'female' || gender === 'male' ? gender : null
}
export const setGender = (gender: VoiceGender | null) => save(GENDER_KEY, gender)
// 声は言語ごとに選ぶ（英語は以前のキーのまま）
const voiceKey = (lang: StudyLang) => (lang === 'en' ? VOICE_KEY : `${VOICE_KEY}:${lang}`)
/** 選んだ声の voiceURI。null なら一番よい声を自動で選ぶ */
export const getVoiceUri = (lang: StudyLang) => load(voiceKey(lang))
export const setVoiceUri = (lang: StudyLang, uri: string | null) => save(voiceKey(lang), uri)
/** 辞書にある人の録音を優先するか（はじめはオン） */
export const getUseRecordings = () => load(RECORDINGS_KEY) !== 'off'
export const setUseRecordings = (on: boolean) => save(RECORDINGS_KEY, on ? null : 'off')

// iPhone・Mac・Windows・Android（Google）の英語・ドイツ語・日本語の声で、名前から性別がわかるもの
const FEMALE = new Set(
  'female samantha victoria karen moira tessa fiona veena allison ava susan zoe nicky serena kate martha catherine joelle noelle zira aria jenny hazel libby sonia natasha michelle emma ana sara anna petra helena katja hedda amala seraphina kyoko haruka ayumi sayaka nanami'.split(' '),
)
const MALE = new Set(
  'male alex daniel fred rishi aaron arthur gordon evan nathan tom oliver lee david mark guy george ryan christopher eric james markus yannick stefan conrad killian otoya ichiro keita hattori'.split(' '),
)
// Mac・iPhone の効果音のような声や、古い合成音声（Eloquence）は機械的なので出さない
const NOVELTY = new Set(
  'albert bad bahh bells boing bubbles cellos good jester organ pipe superstar trinoids whisper wobble zarvox junior kathy ralph princess deranged hysterical eddy flo grandma grandpa reed rocko sandy shelley'.split(' '),
)

const words = (name: string) => name.toLowerCase().split(/[^a-z]+/)

function genderOf(name: string): VoiceGender | null {
  const list = words(name)
  if (list.some((w) => FEMALE.has(w))) return 'female'
  if (list.some((w) => MALE.has(w))) return 'male'
  return null
}

/** 人の声に近いほど高い点。高品質版（Premium・Enhanced・Natural など）を優先する */
function quality(voice: SpeechSynthesisVoice, lang: StudyLang): number {
  let score = 0
  if (/premium|natural|neural/i.test(voice.name)) score += 4
  if (/enhanced|siri/i.test(voice.name)) score += 3
  if (/google|online/i.test(voice.name)) score += 2
  if (voice.lang.replace('_', '-') === PROFILES[lang].speech) score += 1
  return score
}

/** この端末の、その言語の声（人の声に近い順） */
export function voicesFor(lang: StudyLang): VoiceOption[] {
  if (!speechSupported) return []
  return speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith(lang) && !NOVELTY.has(words(voice.name)[0]))
    .sort((a, b) => quality(b, lang) - quality(a, lang))
    .map((voice) => ({ voice, gender: genderOf(voice.name) }))
}

/** 選んだ声。なければ選んだ性別の中で、それもなければ全体で一番よい声 */
function chooseVoice(lang: StudyLang): SpeechSynthesisVoice | undefined {
  const voices = voicesFor(lang)
  const uri = getVoiceUri(lang)
  const gender = getGender()
  return (
    voices.find((v) => v.voice.voiceURI === uri)?.voice ??
    voices.find((v) => !gender || v.gender === gender)?.voice ??
    voices[0]?.voice
  )
}

let playing: HTMLAudioElement | null = null

function stop() {
  playing?.pause()
  playing = null
  if (speechSupported) speechSynthesis.cancel()
}

/** 端末の音声で読み上げる */
export function speak(text: string, lang: StudyLang) {
  stop()
  if (!speechSupported) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = PROFILES[lang].speech
  const voice = chooseVoice(lang)
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }
  utterance.rate = 0.9
  speechSynthesis.speak(utterance)
}

/** 録音があればそれを流し、なければ（再生できなければ）端末の音声で読む */
export function pronounce(text: string, recording: string | null, lang: StudyLang) {
  if (!recording) return speak(text, lang)
  stop()
  const audio = new Audio(recording)
  playing = audio
  audio.play().catch(() => speak(text, lang))
}

/**
 * 発音の録音を探す。iPhone ではボタンを押してから取りに行くと再生できないので、単語を表示したときに先に探しておく。
 * 録音を使わない設定や、通信に失敗したときは null。
 * 「der Hund」のように見出しと違う形で書いた単語は、書いたとおりに読み上げるので録音を使わない。
 */
export function prepareRecording(word: string, lang: StudyLang): Promise<string | null> {
  const { searchForm, findRecording } = PROFILES[lang]
  if (!getUseRecordings() || searchForm(word) !== word.trim()) return Promise.resolve(null)
  return findRecording(word.trim()).catch(() => null)
}
