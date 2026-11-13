import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Lang } from '../i18n'
import type { Messages } from '../i18n/ja'
import type { CardKind } from './db'
import { supabase } from './db'

// マップの AI（supabase/functions/ai）。Claude の API キーは Supabase の secret にだけ置く。

/** AI の関数がまだ使えない（デプロイしていない・API キーを設定していない） */
export class AiNotReadyError extends Error {}

/** AI が答えを返せなかった（refused: 安全のために断った / busy: 混雑 など） */
export class AiFailedError extends Error {}

/** 画面に出すエラーの文 */
export function aiErrorMessage(error: unknown, t: Messages): string {
  if (error instanceof AiNotReadyError) return t.ai.notReady
  if (error instanceof AiFailedError && error.message === 'refused') return t.ai.refused
  if (error instanceof AiFailedError && error.message === 'busy') return t.ai.busy
  return t.ai.failed
}

async function ask<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai', { body })
  if (!error) return data as T
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    const detail = (await response.json().catch(() => null)) as { error?: string } | null
    if (response.status === 404 || detail?.error === 'not_configured') throw new AiNotReadyError()
    throw new AiFailedError(detail?.error ?? `http_${response.status}`)
  }
  throw error
}

/** その項目（path の最後）から伸ばせる枝の候補 */
export async function suggestBranches(lang: Lang, path: string[], definition: string, existing: string[]): Promise<string[]> {
  const { suggestions } = await ask<{ suggestions: string[] }>({ task: 'suggest', lang, path, definition, existing })
  const seen = new Set([...existing, ...path].map((s) => s.trim().toLowerCase()))
  return suggestions.map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
}

/** その項目（path の最後）の定義 */
export async function writeDefinition(lang: Lang, path: string[], siblings: string[], children: string[]): Promise<string> {
  const { definition } = await ask<{ definition: string }>({ task: 'define', lang, path, siblings, children })
  return definition.trim()
}

/** 一言メモから作る項目。parent は outline の ref か 'inbox' */
export interface Placement {
  parent: string
  title: string
  definition: string
}

export async function placeNote(lang: Lang, text: string, outline: { ref: string; path: string }[]): Promise<Placement[]> {
  const { items } = await ask<{ items: Placement[] }>({ task: 'place', lang, text, outline })
  return items.filter((item) => item.title.trim())
}

export interface Grading {
  points: { mark: 'ok' | 'partial' | 'missing' | 'wrong'; text: string }[]
  /** 1: 忘れてた / 2: うろ覚え / 3: 覚えてた / 4: 簡単 */
  grade: 1 | 2 | 3 | 4
  comment: string
}

/** 復習の答えの採点。expected はマップに書いてある答え */
export function gradeAnswer(lang: Lang, path: string[], kind: CardKind, expected: string, answer: string): Promise<Grading> {
  return ask<Grading>({ task: 'grade', lang, path, kind, expected, answer })
}
