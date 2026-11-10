import { Rating, type Grade } from 'ts-fsrs'
import type { Memo } from './db'
import { endOfDay } from './scheduler'
import { load, save } from './storage'

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
  /** 例の英訳（Wiktionary） */
  translation?: string
}

export interface DictionaryEntry {
  word: string
  phonetic?: string
  definitions: Definition[]
}

interface ApiEntry {
  word: string
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
  meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[]
}

// 発音の録音と意味の両方で使うので、同じ単語は1回だけ取ってくる（失敗したときは次にもう一度試す）
const entriesCache = new Map<string, Promise<ApiEntry[] | null>>()

function fetchEntries(word: string): Promise<ApiEntry[] | null> {
  const key = word.toLowerCase()
  let entries = entriesCache.get(key)
  if (!entries) {
    entries = (async () => {
      const res = await fetchWithRetry(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Dictionary error ${res.status}`)
      return (await res.json()) as ApiEntry[]
    })()
    entries.catch(() => entriesCache.delete(key))
    entriesCache.set(key, entries)
  }
  return entries
}

/** 英単語の意味を引く。辞書になければ null。 */
export async function lookUp(word: string): Promise<DictionaryEntry | null> {
  const entries = await fetchEntries(word)
  if (!entries) return null
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

/** 辞書にある、人が読み上げた発音の録音（アメリカ英語を優先）。なければ null。 */
export async function findRecording(word: string): Promise<string | null> {
  const audio = ((await fetchEntries(word)) ?? []).flatMap((e) => e.phonetics ?? []).flatMap((p) => (p.audio ? [p.audio] : []))
  return audio.find((url) => url.endsWith('-us.mp3')) ?? audio[0] ?? null
}

export const googleDefineUrl = (word: string) => `https://www.google.com/search?q=${encodeURIComponent(`define ${word}`)}`

// ---- 英語以外の辞書（英語版 Wiktionary：意味は英語。API キー不要・無料） ----

// Wiktionary の見出しに使われている言語名
const WIKTIONARY_NAMES: Record<string, string> = { de: 'German', ja: 'Japanese' }

interface WiktionaryUsage {
  partOfSpeech: string
  definitions: { definition: string; parsedExamples?: { example: string; translation?: string }[] }[]
}

/** HTML の文字だけを取り出す（ふりがなは「飯(はん)」のように残る）。ところどころに入っている CSS は除く */
function plainText(html: string): string {
  const { body } = new DOMParser().parseFromString(html, 'text/html')
  body.querySelectorAll('style').forEach((style) => style.remove())
  return body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

/** ドイツ語の名詞は大文字で始まるので、書いたままで見つからなければ大文字・小文字を変えて引く */
function titleCandidates(word: string): string[] {
  const first = word.charAt(0)
  return [...new Set([word, first.toUpperCase() + word.slice(1), first.toLowerCase() + word.slice(1)])]
}

// 同じ単語は1回だけ取ってくる（失敗したときは次にもう一度試す）
function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let value = cache.get(key)
  if (!value) {
    value = load()
    value.catch(() => cache.delete(key))
    cache.set(key, value)
  }
  return value
}

const definitionsCache = new Map<string, Promise<Record<string, WiktionaryUsage[]> | null>>()

function fetchDefinitions(title: string) {
  return cached(definitionsCache, title, async () => {
    const res = await fetchWithRetry(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(title)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Wiktionary error ${res.status}`)
    return (await res.json()) as Record<string, WiktionaryUsage[]>
  })
}

const sectionCache = new Map<string, Promise<string | null>>()

/** 見出しの、その言語の部分の wikitext（発音記号と録音のファイル名が書いてある）。なければ null */
function fetchSection(title: string, lang: string) {
  return cached(sectionCache, `${lang}:${title}`, async () => {
    const params = new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', format: 'json', formatversion: '2', origin: '*' })
    const res = await fetchWithRetry(`https://en.wiktionary.org/w/api.php?${params}`)
    if (!res.ok) throw new Error(`Wiktionary error ${res.status}`)
    const wikitext = ((await res.json()) as { parse?: { wikitext: string } }).parse?.wikitext
    return wikitext?.split(new RegExp(`^==${WIKTIONARY_NAMES[lang]}==\\s*$`, 'm'))[1]?.split(/^==[^=]/m)[0] ?? null
  })
}

/** Wiktionary で意味を引く。辞書になければ null。 */
export async function lookUpWiktionary(word: string, lang: string): Promise<DictionaryEntry | null> {
  for (const title of titleCandidates(word)) {
    // 品詞ごとに上位2つまで、全体で6つまで
    const definitions = ((await fetchDefinitions(title))?.[lang] ?? [])
      .flatMap((usage) =>
        usage.definitions
          .map((d) => ({ d, definition: plainText(d.definition) }))
          .filter(({ definition }) => definition)
          .slice(0, 2)
          .map(({ d, definition }) => {
            const example = d.parsedExamples?.[0]
            return {
              partOfSpeech: usage.partOfSpeech,
              definition,
              example: example && plainText(example.example),
              translation: example?.translation && plainText(example.translation),
            }
          }),
      )
      .slice(0, 6)
    if (definitions.length === 0) continue
    // 発音記号は取れなくても意味は出す
    const section = await fetchSection(title, lang).catch(() => null)
    const phonetic = section?.match(new RegExp(`\\{\\{IPA\\|${lang}\\|([^|}]+)`))?.[1]
    return { word: title, phonetic, definitions }
  }
  return null
}

/** Wiktionary にある、人が読み上げた発音の録音。なければ null。 */
export async function findWiktionaryRecording(word: string, lang: string): Promise<string | null> {
  for (const title of titleCandidates(word)) {
    const file = (await fetchSection(title, lang))?.match(new RegExp(`\\{\\{audio\\|${lang}\\|([^|}]+)`))?.[1]
    if (!file) continue
    const params = new URLSearchParams({
      action: 'query',
      titles: `File:${file.trim()}`,
      prop: 'videoinfo',
      viprop: 'url|derivatives',
      format: 'json',
      formatversion: '2',
      origin: '*',
    })
    const res = await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${params}`)
    if (!res.ok) throw new Error(`Wikimedia Commons error ${res.status}`)
    const { query } = (await res.json()) as { query?: { pages: { videoinfo?: { url: string; derivatives?: { src: string }[] }[] }[] } }
    const info = query?.pages[0]?.videoinfo?.[0]
    // 録音は .ogg が多く、iPhone では再生できないことがあるので、変換済みの mp3 を優先する
    return info?.derivatives?.find((d) => d.src.endsWith('.mp3'))?.src ?? info?.url ?? null
  }
  return null
}

// ---- 例文（Tatoeba：人が書いた例文の公開データベース。API キー不要・無料） ----

export interface Example {
  id: number
  text: string
  /** 訳（あれば） */
  translation: string | null
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
  translations?: { text: string; lang: string; is_direct: boolean }[]
}

// 長すぎる文はカードで読みにくいので出さない
const MAX_EXAMPLE_LENGTH = 160

async function searchSentences(params: URLSearchParams): Promise<TatoebaSentence[]> {
  const res = await fetchWithRetry(`https://api.tatoeba.org/unstable/sentences?${params}`)
  if (!res.ok) throw new Error(`Tatoeba error ${res.status}`)
  return ((await res.json()) as { data: TatoebaSentence[] }).data
}

/**
 * 単語を使った例文（lang は Tatoeba の言語コード：eng / deu / jpn）をランダムにいくつか探す。見つからなければ空の配列。
 * translateTo を指定すると、その言語の訳がある文を優先して、訳も付ける。
 */
export async function findExamples(word: string, lang: string, translateTo: string | null): Promise<Example[]> {
  // 熟語（look up など）はその並びのまま探す。1語なら活用形（runs, running）も含めて探す
  const q = /\s/.test(word) ? `"${word}"` : word
  const params = new URLSearchParams({ lang, q, sort: 'random', limit: '30', is_unapproved: 'no' })
  let data: TatoebaSentence[] = []
  if (translateTo) data = await searchSentences(new URLSearchParams([...params, ['trans:lang', translateTo]]))
  // 訳のある文がなければ、訳なしで探す
  if (data.length === 0) data = await searchSentences(params)
  return data
    .filter((s) => !s.is_unapproved && s.text.length <= MAX_EXAMPLE_LENGTH)
    .map(({ id, text, owner, license, translations = [] }) => {
      const candidates = translations.filter((t) => t.lang === translateTo)
      const translation = (candidates.find((t) => t.is_direct) ?? candidates[0])?.text ?? null
      return { id, text, translation, owner, license }
    })
}

export const tatoebaUrl = (id: number) => `https://tatoeba.org/sentences/show/${id}`
