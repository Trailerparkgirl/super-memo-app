import { parseTags } from './memos'

// ---- 単語リストの読み込み ----

export interface WordListItem {
  word: string
  meaning: string
  tags: string[]
}

// 1行目がこのような見出しなら読み飛ばす
const HEADERS = new Set(['word', 'words', 'term', 'front', '単語', '英単語'])

/** CSV の1行を列に分ける。"..." で囲んだ列は、中のカンマや "" （" のこと）をそのまま使う */
function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (c === separator) {
      cells.push(cell)
      cell = ''
    } else cell += c
  }
  cells.push(cell)
  return cells.map((s) => s.trim())
}

/**
 * 単語リスト（1行に1語：単語, 意味, タグ）を読む。
 * タブ区切り（Quizlet・Anki・Excel から書き出したもの）とカンマ区切り（CSV）に対応する。
 * 空の行と # で始まる行は読み飛ばす。
 */
export function parseWordList(text: string): WordListItem[] {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
  // タブが1つでもあればタブ区切り、なければカンマ区切り
  const separator = lines.some((line) => line.includes('\t')) ? '\t' : ','
  const items = lines.map((line) => {
    const [word = '', meaning = '', tags = ''] = splitCsvLine(line, separator)
    return { word, meaning, tags: parseTags(tags) }
  })
  if (items.length > 0 && HEADERS.has(items[0].word.toLowerCase())) items.shift()
  return items.filter((item) => item.word)
}

export const SAMPLE_WORD_LIST = `word,meaning,tags
apple,りんご,food
resilient,回復力のある,TOEIC
"run","走る, 運営する",verb
look up,調べる,
`
