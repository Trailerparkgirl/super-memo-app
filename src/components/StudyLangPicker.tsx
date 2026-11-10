import { useAtom } from 'jotai'
import { useI18n } from '../i18n'
import type { StudyLang } from '../lib/db'
import { PROFILES, STUDY_LANGS, studyFilterAtom } from '../lib/languages'

const chip = (active: boolean) =>
  `shrink-0 rounded-full px-3 py-1 text-sm ${active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`

/** いま勉強している言語の切り替え（すべて / 英語 / ドイツ語 / 日本語）。選んだ言語のメモだけを出す */
export function StudyLangPicker() {
  const { t } = useI18n()
  const [filter, setFilter] = useAtom(studyFilterAtom)
  return (
    <div className="flex gap-1.5 overflow-x-auto">
      <button onClick={() => setFilter('all')} className={chip(filter === 'all')}>
        {t.studyLang.all}
      </button>
      {STUDY_LANGS.map((lang) => (
        <button key={lang} onClick={() => setFilter(lang)} className={chip(filter === lang)}>
          {PROFILES[lang].flag} {t.studyLang[lang]}
        </button>
      ))}
    </div>
  )
}

/** メモ1つの言語を選ぶ */
export function LangTabs({ value, onChange }: { value: StudyLang; onChange: (lang: StudyLang) => void }) {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-3 rounded-xl bg-slate-200 p-1 text-sm dark:bg-slate-800">
      {STUDY_LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          className={`rounded-lg py-2 ${value === lang ? 'bg-white font-semibold shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}
        >
          {PROFILES[lang].flag} {t.studyLang[lang]}
        </button>
      ))}
    </div>
  )
}
