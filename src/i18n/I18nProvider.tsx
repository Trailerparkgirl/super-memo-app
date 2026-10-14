import { useEffect, useState, type ReactNode } from 'react'
import { I18nContext, messages, type Lang } from './context'

const STORAGE_KEY = 'super-memo:lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ja' || saved === 'en') return saved
  } catch {
    // ストレージが使えない環境では端末の言語に従う
  }
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = messages[lang].appName
  }, [lang])

  function setLang(next: Lang) {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 保存できなくても今回の表示は切り替わる
    }
  }

  return <I18nContext.Provider value={{ lang, setLang, t: messages[lang] }}>{children}</I18nContext.Provider>
}
