// マップの AI（枝の提案・定義づくり・一言メモの置き場所・復習の採点）。アプリから supabase.functions.invoke('ai') で呼ぶ。
// Claude の API キーはここ（Supabase の secret）にだけ置き、端末には置かない。
//
// デプロイ: supabase functions deploy ai --no-verify-jwt （ログインの確認はこの中で行う）
// 必要なシークレット: ANTHROPIC_API_KEY。モデルを変えるときは ANTHROPIC_MODEL（既定は claude-opus-5-5）
// （SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で設定する）

import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseInput, runTask, TaskError } from './tasks.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5-5'
const anthropic = apiKey ? new Anthropic({ apiKey }) : null
// ログインしている本人かどうかを確かめるためだけに使う
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // API キーを他人に使われないよう、アプリにログインしている人だけ受け付ける
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return json({ error: 'unauthorized' }, 401)

  if (!anthropic) return json({ error: 'not_configured' }, 503)
  const input = parseInput(await req.json().catch(() => null))
  if (!input) return json({ error: 'bad_request' }, 400)

  try {
    return json(await runTask(anthropic, model, input))
  } catch (e) {
    if (e instanceof TaskError) return json({ error: e.code }, 422)
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      console.error(e)
      return json({ error: 'not_configured' }, 503)
    }
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429)
    console.error(e)
    return json({ error: 'failed' }, 502)
  }
})
