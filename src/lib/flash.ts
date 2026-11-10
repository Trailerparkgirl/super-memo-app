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

// 以前この端末に保存していた Gemini の API キーは、もう使わないので消しておく
save('super-memo:gemini-key', null)

export const getDirection = (): FlashDirection => (load(DIRECTION_KEY) === 'back' ? 'back' : 'front')
export const setDirection = (direction: FlashDirection) => save(DIRECTION_KEY, direction)

// ---- 外部の無料 API ----

const ATTEMPTS = 3
const TIMEOUT_MS = 8000

/**
 * 無料の API はときどき失敗したり応答が返ってこなかったりするので、少し待って何回か試す。
 * 通信エラー・タイムアウト・429・5xx のときだけやり直し、それ以外の応答はそのまま返す。
 */
async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (attempt >= ATTEMPTS || (res.status !== 429 && res.status < 500)) return res
    } catch (e) {
      if (attempt >= ATTEMPTS) throw e
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
  }
}

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
  const res = await fetchWithRetry(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
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

// ---- 例文（Tatoeba：人が書いた例文の公開データベース。API キー不要・無料） ----

export interface Example {
  id: number
  text: string
  /** 投稿した人とライセンス（表示が必要） */
  owner: string | null
  license: string | null
}

interface TatoebaSentence {
  id: number
  text: string
  owner: string | null
  license: string | null
  is_unapproved: boolean
}

// 長すぎる文はカードで読みにくいので出さない
const MAX_EXAMPLE_LENGTH = 160

/** 単語を使った英語の例文をランダムにいくつか探す。見つからなければ空の配列。 */
export async function findExamples(word: string): Promise<Example[]> {
  // 熟語（look up など）はその並びのまま探す。1語なら活用形（runs, running）も含めて探す
  const q = /\s/.test(word) ? `"${word}"` : word
  const params = new URLSearchParams({ lang: 'eng', q, sort: 'random', limit: '30', is_unapproved: 'no' })
  const res = await fetchWithRetry(`https://api.tatoeba.org/unstable/sentences?${params}`)
  if (!res.ok) throw new Error(`Tatoeba error ${res.status}`)
  const { data } = (await res.json()) as { data: TatoebaSentence[] }
  return data
    .filter((s) => !s.is_unapproved && s.text.length <= MAX_EXAMPLE_LENGTH)
    .map(({ id, text, owner, license }) => ({ id, text, owner, license }))
}

export const tatoebaUrl = (id: number) => `https://tatoeba.org/sentences/show/${id}`
