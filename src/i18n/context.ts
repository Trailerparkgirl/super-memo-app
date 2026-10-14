import { createContext, useContext } from 'react'
import { en } from './en'
import { ja, type Messages } from './ja'

export type Lang = 'ja' | 'en'

export const LANGUAGES: { lang: Lang; label: string }[] = [
  { lang: 'ja', label: '日本語' },
  { lang: 'en', label: 'English' },
]

export const messages: Record<Lang, Messages> = { ja, en }

export const I18nContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; t: Messages } | null>(null)

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
