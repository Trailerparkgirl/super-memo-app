// AI に頼む仕事ごとの指示と、返事の形（JSON スキーマ）。index.ts から呼ぶ。
// suggest: 項目から伸ばせる枝の候補 / define: 項目の定義 / place: 一言メモを置く場所 / grade: 復習の答えの採点

import type Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'

export type Lang = 'ja' | 'en'

export type TaskInput =
  | { task: 'suggest'; lang: Lang; path: string[]; definition: string; existing: string[] }
  | { task: 'define'; lang: Lang; path: string[]; siblings: string[]; children: string[] }
  | { task: 'place'; lang: Lang; text: string; outline: { ref: string; path: string }[] }
  | { task: 'grade'; lang: Lang; path: string[]; kind: 'explain' | 'children'; expected: string; answer: string }

/** AI が答えられなかった理由（refused: 安全のために断った / incomplete: 長すぎて途中で切れた） */
export class TaskError extends Error {
  code: 'refused' | 'incomplete'
  constructor(code: 'refused' | 'incomplete') {
    super(code)
    this.code = code
  }
}

// ---- 受け取った内容の確認（大きすぎる入力で料金がかさまないように上限も決める） ----

const isString = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const isStrings = (v: unknown, count: number, max: number): v is string[] =>
  Array.isArray(v) && v.length <= count && v.every((s) => isString(s, max))

export function parseInput(body: unknown): TaskInput | null {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.lang !== 'ja' && b.lang !== 'en') return null
  const lang = b.lang
  const path = isStrings(b.path, 40, 300) && b.path.length > 0 ? b.path : null
  switch (b.task) {
    case 'suggest':
      if (!path || !isString(b.definition, 4000) || !isStrings(b.existing, 200, 300)) return null
      return { task: 'suggest', lang, path, definition: b.definition, existing: b.existing }
    case 'define':
      if (!path || !isStrings(b.siblings, 200, 300) || !isStrings(b.children, 200, 300)) return null
      return { task: 'define', lang, path, siblings: b.siblings, children: b.children }
    case 'place': {
      const outline = b.outline
      const okOutline =
        Array.isArray(outline) &&
        outline.length <= 5000 &&
        outline.every((o) => isString((o as { ref?: unknown })?.ref, 20) && isString((o as { path?: unknown })?.path, 2000))
      if (!isString(b.text, 4000) || !b.text.trim() || !okOutline) return null
      return { task: 'place', lang, text: b.text, outline: outline as { ref: string; path: string }[] }
    }
    case 'grade':
      if (!path || (b.kind !== 'explain' && b.kind !== 'children') || !isString(b.expected, 8000) || !isString(b.answer, 4000) || !b.answer.trim()) return null
      return { task: 'grade', lang, path, kind: b.kind, expected: b.expected, answer: b.answer }
    default:
      return null
  }
}

// ---- 指示 ----

const SYSTEM = `You help a software engineer keep a personal mind map of what they learn at work and while coding — for example how AWS services fit together, how Git works, or TypeScript's type system.
Each map has a central theme in the middle. Branches grow out of it into items, and items grow their own branches. Every item has a short title that is shown on the map, and a definition that is hidden on the map and used for spaced-repetition review.
Write titles as short noun phrases (ideally under 20 characters), the way an engineer would label a mind map. Keep established technical terms and product names in their usual form (for example "NAT Gateway", "IAM ロール", "git rebase").
Be technically accurate and up to date. When something has changed over time, describe how it works now.`

const LANGUAGE: Record<Lang, string> = {
  ja: 'Write every title, definition and comment in natural Japanese.',
  en: 'Write every title, definition and comment in English.',
}

const pathText = (path: string[]) => path.join(' › ')
const list = (items: string[]) => (items.length ? items.map((s) => `- ${s}`).join('\n') : '(none)')
const quoted = (text: string) => `"""\n${text.trim()}\n"""`

const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

interface TaskSpec {
  prompt: string
  schema: Record<string, unknown>
  effort: 'low' | 'medium'
}

function spec(input: TaskInput): TaskSpec {
  switch (input.task) {
    case 'suggest': {
      const title = input.path[input.path.length - 1]
      const isTheme = input.path.length === 1
      return {
        effort: 'low',
        prompt: [
          isTheme ? `The central theme of the map: ${title}` : `Where the item sits (from the central theme): ${pathText(input.path)}`,
          input.definition.trim() ? `Definition of "${title}": ${input.definition.trim()}` : '',
          `Branches "${title}" already has:\n${list(input.existing)}`,
          isTheme
            ? `Suggest 5 to 7 main branches that divide "${title}" into its major areas, the way an experienced engineer would organise it.`
            : `Suggest 5 to 7 items that would make good branches growing out of "${title}": its most important parts, kinds, mechanisms or key facts that someone learning it should know.`,
          'Do not repeat existing branches or anything already on the path. Order them from most to least important.',
        ]
          .filter(Boolean)
          .join('\n\n'),
        schema: object({ suggestions: { type: 'array', items: { type: 'string' } } }),
      }
    }
    case 'define': {
      const title = input.path[input.path.length - 1]
      return {
        effort: 'low',
        prompt: [
          `Where the item sits (from the central theme): ${pathText(input.path)}`,
          `Items next to it:\n${list(input.siblings)}`,
          `Its branches:\n${list(input.children)}`,
          `Write the definition of "${title}" as it should be remembered in this context: 1 to 3 sentences of plain text, with no Markdown and no preamble. Say what it is and what it is for, and add one key fact or common pitfall if there is an important one.`,
        ].join('\n\n'),
        schema: object({ definition: { type: 'string' } }),
      }
    }
    case 'place':
      return {
        effort: 'low',
        prompt: [
          `The engineer just wrote this note about something they learned:\n${quoted(input.text)}`,
          `Their mind maps, one item per line as "ref: path from the central theme":\n${input.outline.map((o) => `${o.ref}: ${o.path}`).join('\n')}`,
          'Turn the note into 1 to 3 items to add to the maps. For each item choose the existing item it should hang under (its ref), a short title, and a definition of 1 to 2 sentences that captures what was learned. Prefer the most specific parent that fits. If the note belongs to none of the maps, use the ref "inbox".',
        ].join('\n\n'),
        schema: object({
          items: { type: 'array', items: object({ parent: { type: 'string' }, title: { type: 'string' }, definition: { type: 'string' } }) },
        }),
      }
    case 'grade': {
      const title = input.path[input.path.length - 1]
      const question =
        input.kind === 'explain' ? `Explain what "${title}" is.` : `Name the branches that grow out of "${title}" on the map, and what each one is.`
      return {
        effort: 'medium',
        prompt: [
          `A spaced-repetition review. Where the item sits: ${pathText(input.path)}`,
          `Question: ${question}`,
          `Expected answer, from the engineer's own map:\n${quoted(input.expected)}`,
          `The engineer answered (it may come from voice input, so ignore typos and filler words):\n${quoted(input.answer)}`,
          'Grade the answer against the expected answer. Judge whether the key ideas are there, not the wording. List at most 5 short points, each marked ok (right), partial (partly right), missing (left out) or wrong (incorrect). Then choose a rating: 1 = forgot (mostly missing or wrong), 2 = hard (important parts missing), 3 = good (the main ideas are right), 4 = easy (complete and precise). Finish with one short, encouraging comment.',
        ].join('\n\n'),
        schema: object({
          points: { type: 'array', items: object({ mark: { type: 'string', enum: ['ok', 'partial', 'missing', 'wrong'] }, text: { type: 'string' } }) },
          grade: { type: 'integer', enum: [1, 2, 3, 4] },
          comment: { type: 'string' },
        }),
      }
    }
  }
}

// 安全のために断られたとき、別のモデルでやり直せるモデル（サーバー側のフォールバック）
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']

export async function runTask(client: Anthropic, model: string, input: TaskInput): Promise<unknown> {
  const { prompt, schema, effort } = spec(input)
  const params = {
    model,
    max_tokens: 8000,
    system: `${SYSTEM}\n\n${LANGUAGE[input.lang]}`,
    messages: [{ role: 'user' as const, content: prompt }],
    output_config: { effort, format: { type: 'json_schema' as const, schema } },
  }
  const response = FALLBACK_MODELS.includes(model)
    ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(params)

  if (response.stop_reason === 'refusal') throw new TaskError('refused')
  if (response.stop_reason === 'max_tokens') throw new TaskError('incomplete')
  const text = response.content.filter((b) => b.type === 'text').at(-1)
  if (!text || text.type !== 'text') throw new TaskError('incomplete')
  return JSON.parse(text.text)
}
