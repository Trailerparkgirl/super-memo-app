import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getDefaultStore } from 'jotai'
import './index.css'
import App from './App.tsx'
import { langAtom, messages } from './i18n/context'

// 言語が変わったら、html の lang とタイトルも合わせる
const store = getDefaultStore()
function applyLang() {
  const lang = store.get(langAtom)
  document.documentElement.lang = lang
  document.title = messages[lang].appName
}
applyLang()
store.sub(langAtom, applyLang)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
