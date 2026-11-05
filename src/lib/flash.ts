import { Rating, type Grade } from 'ts-fsrs'
import type { Memo } from './db'
import { endOfDay } from './scheduler'

/** front: 単語を見て意味を思い出す / back: 意味を見て単語を思い出す */
export type FlashDirection = 'front' | 'back'

/** フラッシュカードに出すのは「単語」だけ */
export function flashCards(memos: Memo[], tag: string | null): Memo[] {
  return memos.filter((m) => m.type === 'word' && (!tag || m.tags.includes(tag)))
}

// 練習中に付けた評価が低いカードほど出やすくする
const GRADE_WEIGHT: Record<Grade, number> = {
  [Rating.Again]: 8,
  [Rating.Hard]: 4,
  [Rating.Good]: 2,
  [Rating.Easy]: 1,
}

/**
 * 次に出すカードをランダムに選ぶ（終わりなし）。
 * まだ出していないカードは、今日が復習日なら出やすくする。直前のカードは続けて出さない。
 */
export function pickNext(cards: Memo[], lastGrades: Map<string, Grade>, previousId?: string, now = new Date()): Memo {
  const candidates = cards.length > 1 ? cards.filter((m) => m.id !== previousId) : cards
  const weights = candidates.map((m) => {
    const grade = lastGrades.get(m.id)
    if (grade) return GRADE_WEIGHT[grade]
    return m.due <= endOfDay(now).getTime() ? 5 : 3
  })
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r < 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

// ---- 端末に保存する設定 ----

function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function save(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // 保存できなくても今回は使える
  }
}

const DIRECTION_KEY = 'super-memo:flash-direction'
const GEMINI_KEY = 'super-memo:gemini-key'
const exampleKey = (word: string) => `super-memo:example:${word.toLowerCase()}`

export const getDirection = (): FlashDirection => (load(DIRECTION_KEY) === 'back' ? 'back' : 'front')
export const setDirection = (direction: FlashDirection) => save(DIRECTION_KEY, direction)

/** Gemini の API キーはこの端末にだけ保存する（データベースには送らない） */
export const getGeminiKey = () => load(GEMINI_KEY) ?? ''
export const setGeminiKey = (key: string) => save(GEMINI_KEY, key.trim() || null)

// ---- 辞書（Free Dictionary API） ----

export interface Definition {
  partOfSpeech: string
  definition: string
  example?: string
}

export interface DictionaryEntry {
  word: string
  phonetic?: string
  definitions: Definition[]
}

interface ApiEntry {
  word: string
  phonetic?: string
  phonetics?: { text?: string }[]
  meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[]
}

/** 英単語の意味を引く。辞書になければ null。 */
export async function lookUp(word: string): Promise<DictionaryEntry | null> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Dictionary error ${res.status}`)
  const entries = (await res.json()) as ApiEntry[]
  // 品詞ごとに上位2つまで、全体で6つまで
  const definitions = entries
    .flatMap((e) => e.meanings)
    .flatMap((m) => m.definitions.slice(0, 2).map((d) => ({ partOfSpeech: m.partOfSpeech, ...d })))
    .slice(0, 6)
  const first = entries[0]
  return {
    word: first.word,
    phonetic: first.phonetic ?? first.phonetics?.find((p) => p.text)?.text,
    definitions,
  }
}

export const googleDefineUrl = (word: string) => `https://www.google.com/search?q=${encodeURIComponent(`define ${word}`)}`

// ---- 例文（Gemini の無料枠） ----

export type AiErrorReason = 'noKey' | 'badKey' | 'quota' | 'failed'

export class AiError extends Error {
  reason: AiErrorReason
  constructor(reason: AiErrorReason) {
    super(reason)
    this.reason = reason
  }
}

// 常に最新の Flash モデルを指す別名。無料枠で使える。
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent'

/** 前に作った例文があればそれを返す */
export const cachedExample = (word: string) => load(exampleKey(word))

/** 単語の例文を1つ作る。意味も渡して、覚えたい意味での使い方にする。 */
export async function generateExample(word: string, meaning: string): Promise<string> {
  const key = getGeminiKey()
  if (!key) throw new AiError('noKey')
  const prompt =
    `Write one natural English example sentence that uses "${word}" in this meaning: "${meaning}". ` +
    'Make it different from a dictionary example. Reply with the sentence only.'

  let res: Response
  try {
    res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })
  } catch {
    throw new AiError('failed')
  }
  if (res.status === 429) throw new AiError('quota')
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiError('badKey')
  if (!res.ok) throw new AiError('failed')

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim()
  if (!text) throw new AiError('failed')
  save(exampleKey(word), text)
  return text
}
