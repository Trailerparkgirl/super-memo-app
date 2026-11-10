import { atomWithStorage } from 'jotai/utils'
import type { Lang } from '../i18n'
import type { StudyLang } from './db'
import { findRecording, findWiktionaryRecording, lookUp, lookUpWiktionary, type DictionaryEntry } from './flash'
import { load, save } from './storage'

// ---- 言語ごとの辞書・例文・発音 ----

/** 言語ごとに違うところ。画面はこれを通して使うので、言語を足すときはここに1つ足す */
export interface LanguageProfile {
  flag: string
  /** 読み上げの言語（Web Speech API） */
  speech: string
  /** Tatoeba の言語コード */
  tatoeba: string
  /** 単語の入力欄に出す例 */
  sample: string
  /** 声を試すときに読む文 */
  voiceSample: string
  /** 辞書・例文・録音で調べる形（冠詞や読みがなを外す） */
  searchForm: (word: string) => string
  lookUp: (word: string) => Promise<DictionaryEntry | null>
  findRecording: (word: string) => Promise<string | null>
}

// 「der Hund, -e」「勉強（べんきょう）」のように書いても、カンマやかっこの前だけで調べる
const headword = (word: string) => word.split(/[,;(（]/)[0].trim()

export const PROFILES: Record<StudyLang, LanguageProfile> = {
  en: {
    flag: '🇬🇧',
    speech: 'en-US',
    tatoeba: 'eng',
    sample: 'scrutiny',
    voiceSample: 'Hello! This is how your words will sound.',
    searchForm: (word) => word.trim(),
    lookUp,
    findRecording,
  },
  de: {
    flag: '🇩🇪',
    speech: 'de-DE',
    tatoeba: 'deu',
    sample: 'der Hund',
    voiceSample: 'Hallo! So klingen deine Wörter.',
    // 冠詞（der Hund）や再帰代名詞（sich freuen）を付けて覚えても、辞書は見出しの形で引く
    searchForm: (word) => headword(word).replace(/^(der|die|das|sich)\s+/i, ''),
    lookUp: (word) => lookUpWiktionary(word, 'de'),
    findRecording: (word) => findWiktionaryRecording(word, 'de'),
  },
  ja: {
    flag: '🇯🇵',
    speech: 'ja-JP',
    tatoeba: 'jpn',
    sample: '勉強',
    voiceSample: 'こんにちは。単語はこのように読み上げられます。',
    searchForm: headword,
    lookUp: (word) => lookUpWiktionary(word, 'ja'),
    findRecording: (word) => findWiktionaryRecording(word, 'ja'),
  },
}

export const STUDY_LANGS = Object.keys(PROFILES) as StudyLang[]

/** 例文に付ける訳の言語（Tatoeba の言語コード）。画面の言語に訳し、同じ言語なら英語に訳す。英語どうしなら訳さない */
export function translationLang(lang: StudyLang, uiLang: Lang): string | null {
  const ui = uiLang === 'ja' ? 'jpn' : 'eng'
  if (ui !== PROFILES[lang].tatoeba) return ui
  return lang === 'en' ? null : 'eng'
}

// ---- いま勉強している言語（ホーム・復習・メモ一覧・フラッシュカードで、この言語のメモだけを出す） ----

/** all ならすべての言語 */
export type StudyFilter = StudyLang | 'all'

const isFilter = (value: string | null): value is StudyFilter => value === 'all' || STUDY_LANGS.includes(value as StudyLang)

// 端末ごとに保存する
const storage = {
  getItem: (key: string, initialValue: StudyFilter): StudyFilter => {
    const saved = load(key)
    return isFilter(saved) ? saved : initialValue
  },
  setItem: (key: string, value: StudyFilter) => save(key, value),
  removeItem: (key: string) => save(key, null),
}

export const studyFilterAtom = atomWithStorage<StudyFilter>('super-memo:study-lang', 'all', storage, { getOnInit: true })

/** 新しいメモの言語。すべてを表示しているときは英語 */
export const defaultLang = (filter: StudyFilter): StudyLang => (filter === 'all' ? 'en' : filter)
