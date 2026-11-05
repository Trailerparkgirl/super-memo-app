import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { AiError, cachedExample, generateExample, googleDefineUrl, lookUp, type DictionaryEntry } from '../lib/flash'

/** 単語の辞書と AI 例文。カードを表にしてから使う。 */
export function WordTools({ word, meaning }: { word: string; meaning: string }) {
  const { t } = useI18n()
  // まだ引いていないときは undefined、辞書にない単語は null
  const [entry, setEntry] = useState<DictionaryEntry | null | 'loading' | 'error'>()
  const [example, setExample] = useState(() => cachedExample(word))
  const [exampleState, setExampleState] = useState<'idle' | 'loading' | AiError['reason']>('idle')

  async function define() {
    setEntry('loading')
    try {
      setEntry(await lookUp(word))
    } catch (e) {
      console.error(e)
      setEntry('error')
    }
  }

  async function makeExample() {
    setExampleState('loading')
    try {
      setExample(await generateExample(word, meaning))
      setExampleState('idle')
    } catch (e) {
      setExampleState(e instanceof AiError ? e.reason : 'failed')
    }
  }

  const tool = 'flex-1 rounded-lg border border-slate-200 py-2 text-center text-sm font-medium disabled:opacity-50 dark:border-slate-700'

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
      <div className="flex gap-2">
        {/* 失敗したときはもう一度押せる */}
        <button onClick={define} disabled={entry !== undefined && entry !== 'error'} className={tool}>
          📖 {t.flash.dictionary}
        </button>
        <a href={googleDefineUrl(word)} target="_blank" rel="noreferrer" className={tool}>
          🔎 Google
        </a>
        <button onClick={makeExample} disabled={exampleState === 'loading'} className={tool}>
          ✨ {example ? t.flash.newExample : t.flash.example}
        </button>
      </div>

      {entry === 'loading' && <p className="text-slate-500">{t.flash.loading}</p>}
      {entry === 'error' && <p className="text-rose-500">{t.flash.dictionaryFailed}</p>}
      {entry === null && <p className="rounded-xl bg-slate-50 p-3 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{t.flash.notInDictionary(word)}</p>}
      {entry && typeof entry === 'object' && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p>
            <span className="font-semibold">{entry.word}</span>
            {entry.phonetic && <span className="ml-2 text-slate-500">{entry.phonetic}</span>}
          </p>
          <ol className="space-y-1.5">
            {entry.definitions.map((d, i) => (
              <li key={i}>
                <span className="mr-1.5 text-xs text-indigo-600 italic dark:text-indigo-400">{d.partOfSpeech}</span>
                {d.definition}
                {d.example && <span className="block text-slate-500 italic">“{d.example}”</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {exampleState === 'loading' && <p className="text-slate-500">{t.flash.generating}</p>}
      {exampleState === 'noKey' && (
        <p className="text-slate-500">
          {t.flash.noKey}{' '}
          <Link to="/settings" className="text-indigo-600 underline dark:text-indigo-400">
            {t.tabs.settings}
          </Link>
        </p>
      )}
      {exampleState === 'badKey' && <p className="text-rose-500">{t.flash.badKey}</p>}
      {exampleState === 'quota' && <p className="text-rose-500">{t.flash.quota}</p>}
      {exampleState === 'failed' && <p className="text-rose-500">{t.flash.exampleFailed}</p>}
      {example && (
        <p className="rounded-xl bg-indigo-50 p-3 italic dark:bg-indigo-950/50">
          <span className="mr-1.5 text-xs not-italic text-indigo-600 dark:text-indigo-400">AI</span>
          {example}
        </p>
      )}
    </div>
  )
}
