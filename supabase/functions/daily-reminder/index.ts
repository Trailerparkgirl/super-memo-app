// 毎日の復習リマインダー。supabase/cron.sql で毎時0分に呼ばれ、
// 通知の時刻を過ぎた端末に、その日まだ通知していなければ「今日の復習」の件数を Web Push で送る。
//
// デプロイ: supabase functions deploy daily-reminder --no-verify-jwt
// 必要なシークレット: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT / CRON_SECRET
// （SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で設定する）

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface Subscription {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  remind_hour: number
  time_zone: string
  lang: string
  last_sent_on: string | null
}

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not set`)
  return value
}

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
// 全員の購読を読むので、行レベルセキュリティを通らない service role で接続する
const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))

const messages: Record<string, { title: string; body: (n: number) => string }> = {
  ja: { title: 'スーパーメモ', body: (n) => `今日の復習が${n}件あります` },
  en: { title: 'Super Memo', body: (n) => `You have ${n} ${n === 1 ? 'memo' : 'memos'} to review today` },
}

/** その時間帯での今日の日付（YYYY-MM-DD）、今の時（0〜23）、今日の終わりの時刻 */
function localDay(timeZone: string, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  const [y, m, d, hour] = [Number(parts.year), Number(parts.month), Number(parts.day), Number(parts.hour)]
  // その時間帯の壁時計の時刻を UTC とみなしたときとの差が、UTC からの時差になる
  const offset = Date.UTC(y, m - 1, d, hour, Number(parts.minute), Number(parts.second)) - Math.floor(now.getTime() / 1000) * 1000
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    endOfDay: new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offset),
  }
}

async function remind(subscription: Subscription, now: Date): Promise<boolean> {
  const local = localDay(subscription.time_zone, now)
  // 通知の時刻を過ぎたら、その日の最初の呼び出しで1回だけ送る（呼び出しが遅れても飛ばさない）
  if (local.hour < subscription.remind_hour || subscription.last_sent_on === local.date) return false

  // アプリの「今日の復習」と同じく、今日の終わりまでに予定日が来るメモを数える
  const { count, error } = await supabase
    .from('memos')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', subscription.user_id)
    .lte('due', local.endOfDay.toISOString())
  if (error) throw error
  // 送る前に記録して、失敗しても同じ日に何度も送らないようにする
  await supabase.from('push_subscriptions').update({ last_sent_on: local.date }).eq('endpoint', subscription.endpoint)
  if (!count) return false

  const message = messages[subscription.lang] ?? messages.ja
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify({ title: message.title, body: message.body(count), url: '/review', count }),
    )
    return true
  } catch (e) {
    // 通知を切った・アプリを消した端末にはもう届かないので、購読を消す
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
      return false
    }
    throw e
  }
}

Deno.serve(async (req) => {
  // cron.sql からの呼び出しだけを受け付ける
  if (req.headers.get('Authorization') !== `Bearer ${env('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const now = new Date()
  const { data, error } = await supabase.from('push_subscriptions').select()
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  let failed = 0
  for (const subscription of data as Subscription[]) {
    try {
      if (await remind(subscription, now)) sent++
    } catch (e) {
      // 1台で失敗しても、ほかの端末には送る
      console.error(subscription.endpoint, e)
      failed++
    }
  }
  return Response.json({ sent, failed })
})
