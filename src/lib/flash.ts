import { Rating, type Grade } from 'ts-fsrs'
import { supabase, type Memo } from './db'
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

// ---- Gemini の API キー ----
// アカウント（user_settings テーブル）に保存して、どの端末でも使えるようにする。
// 端末にも控えを置き、通信できないときはそれを使う。

const cachedGeminiKey = () => load(GEMINI_KEY) ?? ''

/** アカウントに保存した API キー。読み込めなければ端末の控えを使う。 */
export async function loadGeminiKey(): Promise<string> {
  const { data, error } = await supabase.from('user_settings').select('gemini_api_key').maybeSingle()
  if (error) {
    console.error(error)
    return cachedGeminiKey()
  }
  if (!data) {
    // 端末にだけ保存していた頃のキーがあれば、アカウントに移す
    const local = cachedGeminiKey()
    if (local) await saveGeminiKey(local).catch((e: unknown) => console.error(e))
    return local
  }
  const key = (data as { gemini_api_key: string | null }).gemini_api_key ?? ''
  save(GEMINI_KEY, key || null)
  return key
}

/** 空にするとキーを削除する。保存できなければ例外を投げる。 */
export async function saveGeminiKey(key: string) {
  const value = key.trim()
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('Not logged in')
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, gemini_api_key: value || null, updated_at: new Date().toISOString() })
  if (error) throw error
  save(GEMINI_KEY, value || null)
}

/** ログアウトしたら端末の控えを消す（次に別のアカウントでログインしたときに混ざらないように） */
export const clearCachedGeminiKey = () => save(GEMINI_KEY, null)

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
  const key = await loadGeminiKey()
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
