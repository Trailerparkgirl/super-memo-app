import { useState } from 'react'
import { useI18n } from '../i18n'
import type { StudyLang } from '../lib/db'
import { findExamples, googleDefineUrl, tatoebaUrl, type DictionaryEntry, type Example } from '../lib/flash'
import { PROFILES, translationLang } from '../lib/languages'

/** 単語の辞書と例文（Tatoeba）。カードを表にしてから使う。辞書と例文は単語の言語のものを使う。 */
export function WordTools({ word: written, lang }: { word: string; lang: StudyLang }) {
  const { t, lang: uiLang } = useI18n()
  const profile = PROFILES[lang]
  // 「der Hund」と書いた単語は「Hund」で調べる
  const word = profile.searchForm(written)
  // まだ引いていないときは undefined、辞書にない単語は null
  const [entry, setEntry] = useState<DictionaryEntry | null | 'loading' | 'error'>()
  // 例文は最初に押したときにまとめて取ってきて、押すたびに次の文を見せる
  const [examples, setExamples] = useState<Example[] | null>(null)
  const [exampleIndex, setExampleIndex] = useState(-1)
  const [exampleState, setExampleState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const example = examples?.[exampleIndex]

  async function define() {
    setEntry('loading')
    try {
      setEntry(await profile.lookUp(word))
    } catch (e) {
      console.error(e)
      setEntry('error')
    }
  }

  async function nextExample() {
    if (examples) {
      setExampleIndex((i) => (i + 1) % Math.max(1, examples.length))
      return
    }
    setExampleState('loading')
    try {
      setExamples(await findExamples(word, profile.tatoeba, translationLang(lang, uiLang)))
      setExampleIndex(0)
      setExampleState('idle')
    } catch (e) {
      console.error(e)
      setExampleState('failed')
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
        <button
          onClick={nextExample}
          disabled={exampleState === 'loading' || (examples !== null && examples.length <= 1)}
          className={tool}
        >
          💬 {example ? t.flash.newExample : t.flash.example}
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
                {d.translation && <span className="block text-slate-500">{d.translation}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {exampleState === 'loading' && <p className="text-slate-500">{t.flash.findingExamples}</p>}
      {exampleState === 'failed' && <p className="text-rose-500">{t.flash.exampleFailed}</p>}
      {examples?.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-3 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{t.flash.noExamples(word)}</p>
      )}
      {example && (
        <div className="space-y-1 rounded-xl bg-indigo-50 p-3 dark:bg-indigo-950/50">
          <p className="italic">“{example.text}”</p>
          {example.translation && <p className="text-slate-600 dark:text-slate-300">{example.translation}</p>}
          <p className="text-right text-xs text-slate-500">
            <a href={tatoebaUrl(example.id)} target="_blank" rel="noreferrer" className="underline">
              Tatoeba
            </a>
            {example.owner && ` · ${example.owner}`}
            {example.license && ` · ${example.license}`}
            {examples && ` · ${exampleIndex + 1}/${examples.length}`}
          </p>
        </div>
      )}
    </div>
  )
}
