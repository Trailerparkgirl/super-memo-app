import { supabase } from './db'

// 毎日の復習リマインダー（Web Push）。この端末の購読を push_subscriptions に保存すると、
// supabase/functions/daily-reminder が毎日決まった時刻に「今日の復習」を通知する。

const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY

/** サーバー側の準備（VAPID 鍵）ができているか */
export const reminderConfigured = !!publicKey

/** このブラウザでプッシュ通知が使えるか。iPhone はホーム画面に追加したアプリ（iOS 16.4 以降）でだけ使える */
export const reminderSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export class NotificationDeniedError extends Error {}

function toKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/** Service Worker は本番ビルドでだけ登録されるので、開発中は null になる */
async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

/** この端末で設定している通知の時刻。通知していなければ null */
export async function getReminderHour(): Promise<number | null> {
  const subscription = await currentSubscription()
  if (!subscription) return null
  const { data, error } = await supabase.from('push_subscriptions').select('remind_hour').eq('endpoint', subscription.endpoint).maybeSingle()
  if (error) throw error
  return (data as { remind_hour: number } | null)?.remind_hour ?? null
}

/** 通知を許可してもらい、この端末を登録する（すでに登録済みなら時刻と言語を変える）。ボタンを押したときに呼ぶ */
export async function enableReminder(hour: number, lang: string) {
  if (!publicKey) throw new Error('VITE_VAPID_PUBLIC_KEY is not set')
  if ((await Notification.requestPermission()) !== 'granted') throw new NotificationDeniedError()
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) throw new Error('Service worker is not registered')
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }))
  const { keys } = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: subscription.endpoint,
    p256dh: keys?.p256dh,
    auth: keys?.auth,
    remind_hour: hour,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lang,
  })
  if (error) throw error
}

/** この端末への通知をやめる */
export async function disableReminder() {
  const subscription = await currentSubscription()
  if (!subscription) return
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  if (error) throw error
  await subscription.unsubscribe()
}
