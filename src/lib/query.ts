// ---- Supabase の問い合わせを書くための小さな道具 ----

type Result<T> = PromiseLike<{ data: T | null; error: unknown }>
type CountResult = PromiseLike<{ count: number | null; error: unknown }>

export async function run<T>(query: Result<T>): Promise<T> {
  const { data, error } = await query
  if (error) throw error
  return data as T
}

export async function runCount(query: CountResult): Promise<number> {
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

// Supabase は1回に最大1000行しか返さないので、分けて全部取ってくる
const PAGE = 1000

export async function selectAll<T>(page: (from: number, to: number) => Result<T[]>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const chunk = await run(page(from, from + PAGE - 1))
    rows.push(...chunk)
    if (chunk.length < PAGE) return rows
  }
}

export function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))
}

/** テーブルや関数がまだない（schema.sql を実行していない）ときのエラーか */
export function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883'
}
