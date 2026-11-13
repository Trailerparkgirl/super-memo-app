/** テーマから出る枝の色。マップの線と、テーマのすぐ外の項目の塗りに使う（白い文字が読める濃さ） */
export const BRANCH_COLORS = {
  indigo: '#6366f1',
  sky: '#0284c7',
  emerald: '#059669',
  amber: '#d97706',
  rose: '#e11d48',
  violet: '#7c3aed',
  teal: '#0d9488',
  orange: '#ea580c',
} as const

export type BranchColor = keyof typeof BRANCH_COLORS

export const BRANCH_COLOR_KEYS = Object.keys(BRANCH_COLORS) as BranchColor[]

const isBranchColor = (key: string | null | undefined): key is BranchColor => !!key && key in BRANCH_COLORS

/** 色のキーから実際の色。決まっていなければ i 番目の枝として順に割り当てる */
export function branchHex(key: string | null | undefined, index = 0): string {
  return BRANCH_COLORS[isBranchColor(key) ? key : BRANCH_COLOR_KEYS[index % BRANCH_COLOR_KEYS.length]]
}

/** 新しい枝の色。まだ使っていない色から選び、全部使っていたら順番に回す */
export function nextBranchColor(used: (string | null)[]): BranchColor {
  return BRANCH_COLOR_KEYS.find((key) => !used.includes(key)) ?? BRANCH_COLOR_KEYS[used.length % BRANCH_COLOR_KEYS.length]
}
