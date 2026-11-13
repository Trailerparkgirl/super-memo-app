import {
  cardToRow,
  logFromRow,
  logToRow,
  mapToRow,
  memoToRow,
  nodeToRow,
  reviveCard,
  supabase,
  type MapNode,
  type Memo,
  type MindMap,
  type NodeCard,
  type ReviewLog,
  type ReviewLogRow,
} from './db'
import { getInbox, loadLibrary } from './maps'
import { listMemos } from './memos'
import { chunks, run, selectAll } from './query'
import { notifyChange } from './useData'

// ---- バックアップ ----
// version 1: メモ（自由メモ・問題・単語）と復習の記録 / version 2: 単語、マップ・項目・カード、復習の記録

interface Backup {
  app: 'super-memo'
  version: 1 | 2
  exportedAt: string
  memos: Memo[]
  logs: ReviewLog[]
  maps?: MindMap[]
  nodes?: MapNode[]
  cards?: NodeCard[]
}

export async function exportBackup(): Promise<Blob> {
  const [memos, logs, library] = await Promise.all([
    listMemos(),
    selectAll<ReviewLogRow>((from, to) => supabase.from('review_logs').select().order('id').range(from, to)),
    loadLibrary(),
  ])
  const backup: Backup = {
    app: 'super-memo',
    version: 2,
    exportedAt: new Date().toISOString(),
    memos,
    logs: logs.map(logFromRow),
    maps: library.maps,
    nodes: library.nodes,
    cards: library.cards,
  }
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
}

export class InvalidBackupError extends Error {}

/**
 * バックアップを読み込む。同じ ID のものは上書きする。読み込んだ件数（単語と項目）を返す。
 * 前のバージョンの「自由メモ」「問題」は、受信箱の項目にする（schema.sql の移し方と同じ）。
 * 受信箱は1人に1つなので、すでにあれば、バックアップの受信箱の中身をそこへ入れる。
 * 途中で失敗しても、もう一度読み込めば最後まで反映される。
 */
export async function importBackup(file: File, inboxTitle: string): Promise<number> {
  const data = JSON.parse(await file.text()) as Backup
  if (data.app !== 'super-memo' || !Array.isArray(data.memos)) throw new InvalidBackupError()

  const memos: Memo[] = data.memos.map((m) => {
    const card = reviveCard(m.card)
    // 言語を足す前のバックアップは英語として読む
    return { ...m, lang: m.lang ?? 'en', createdAt: new Date(m.createdAt), updatedAt: new Date(m.updatedAt), card, due: card.due.getTime() }
  })
  const words = memos.filter((m) => m.type === 'word')
  const notes = memos.filter((m) => m.type !== 'word')
  let maps: MindMap[] = (data.maps ?? []).map((m) => ({ ...m, createdAt: new Date(m.createdAt) }))
  let nodes: MapNode[] = (data.nodes ?? []).map((n) => ({ ...n, createdAt: new Date(n.createdAt), updatedAt: new Date(n.updatedAt) }))
  const cards: NodeCard[] = (data.cards ?? []).map((c) => {
    const card = reviveCard(c.card)
    return { ...c, card, due: card.due.getTime() }
  })

  const backupInbox = maps.find((m) => m.kind === 'inbox')
  if (notes.length > 0 || backupInbox) {
    const current = await run<{ id: string } | null>(supabase.from('maps').select('id').eq('kind', 'inbox').maybeSingle())
    if (current || !backupInbox) {
      const inbox = await getInbox(inboxTitle)
      if (backupInbox && backupInbox.id !== inbox.mapId) {
        const oldCenter = nodes.find((n) => n.mapId === backupInbox.id && n.parentId === null)
        maps = maps.filter((m) => m.id !== backupInbox.id)
        nodes = nodes
          .filter((n) => n.id !== oldCenter?.id)
          .map((n) => (n.mapId === backupInbox.id ? { ...n, mapId: inbox.mapId, parentId: n.parentId === oldCenter?.id ? inbox.centerId : n.parentId } : n))
      }
      addNotes(inbox)
    } else {
      const center = nodes.find((n) => n.mapId === backupInbox.id && n.parentId === null)
      if (center) addNotes({ mapId: backupInbox.id, centerId: center.id })
    }
  }

  function addNotes(inbox: { mapId: string; centerId: string }) {
    for (const memo of notes) {
      nodes.push({
        id: memo.id,
        mapId: inbox.mapId,
        parentId: inbox.centerId,
        position: memo.createdAt.getTime() / 1000,
        title: memo.title,
        definition: memo.body,
        color: null,
        createdAt: memo.createdAt,
        updatedAt: memo.updatedAt,
      })
      cards.push({ id: memo.id, nodeId: memo.id, kind: 'explain', card: memo.card, due: memo.due })
    }
  }

  // 親から先に書く（親より先に子を書くと、外部キーの確認で失敗する）
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const depth = (node: MapNode): number => {
    let d = 0
    for (let p = node.parentId ? byId.get(node.parentId) : undefined; p && d < 1000; p = p.parentId ? byId.get(p.parentId) : undefined) d++
    return d
  }
  nodes.sort((a, b) => depth(a) - depth(b))

  const wordIds = new Set(words.map((m) => m.id))
  const cardIds = new Set(cards.map((c) => c.id))
  const noteIds = new Set(notes.map((m) => m.id))
  const logs = (data.logs ?? [])
    // 前のバージョンの「自由メモ」「問題」の記録は、受信箱の項目のカードの記録にする
    .map((l) => (l.memoId && noteIds.has(l.memoId) ? { ...l, memoId: undefined, cardId: l.memoId } : l))
    .filter((l) => (l.memoId && wordIds.has(l.memoId)) || (l.cardId && cardIds.has(l.cardId)))
    .map((l) => logToRow({ ...l, reviewedAt: new Date(l.reviewedAt) }))

  for (const chunk of chunks(maps, 500)) await run(supabase.from('maps').upsert(chunk.map(mapToRow)))
  for (const chunk of chunks(nodes, 500)) await run(supabase.from('nodes').upsert(chunk.map(nodeToRow)))
  for (const chunk of chunks(cards, 500)) await run(supabase.from('cards').upsert(chunk.map(cardToRow)))
  for (const chunk of chunks(words, 500)) await run(supabase.from('memos').upsert(chunk.map(memoToRow)))
  // 読み込むものの記録は、いったん消してから入れ直す（二重にならないように）
  for (const chunk of chunks([...wordIds], 100)) await run(supabase.from('review_logs').delete().in('memo_id', chunk))
  for (const chunk of chunks([...cardIds], 100)) await run(supabase.from('review_logs').delete().in('card_id', chunk))
  for (const chunk of chunks(logs, 500)) await run(supabase.from('review_logs').insert(chunk))
  notifyChange()
  return words.length + nodes.length
}
