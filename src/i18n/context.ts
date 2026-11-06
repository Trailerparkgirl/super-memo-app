import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { en } from './en'
import { ja, type Messages } from './ja'

export type Lang = 'ja' | 'en'

export const LANGUAGES: { lang: Lang; label: string }[] = [
  { lang: 'ja', label: '日本語' },
  { lang: 'en', label: 'English' },
]

export const messages: Record<Lang, Messages> = { ja, en }

const STORAGE_KEY = 'super-memo:lang'

function defaultLang(): Lang {
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

// 以前と同じく、localStorage には 'ja' / 'en' の文字列をそのまま保存する
const storage = {
  getItem(key: string, initialValue: Lang): Lang {
    try {
      const saved = localStorage.getItem(key)
      if (saved === 'ja' || saved === 'en') return saved
    } catch {
      // ストレージが使えない環境では端末の言語に従う
    }
    return initialValue
  },
  setItem(key: string, value: Lang) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // 保存できなくても今回の表示は切り替わる
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      // 何もしない
    }
  },
}

export const langAtom = atomWithStorage<Lang>(STORAGE_KEY, defaultLang(), storage, { getOnInit: true })
export const messagesAtom = atom((get) => messages[get(langAtom)])

export function useI18n() {
  const lang = useAtomValue(langAtom)
  const setLang = useSetAtom(langAtom)
  const t = useAtomValue(messagesAtom)
  return { lang, setLang, t }
}
