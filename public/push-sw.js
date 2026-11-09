// 復習リマインダーのプッシュ通知を受け取って表示する。
// vite.config.ts の workbox.importScripts で、vite-plugin-pwa が作る Service Worker に読み込まれる。

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const tasks = [
    self.registration.showNotification(data.title || 'Super Memo', {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      // 前の日の通知が残っていたら置き換える
      tag: 'daily-reminder',
      data: { url: data.url || '/' },
    }),
  ]
  // アプリを開いていなくても、アイコンのバッジを今日の件数にする（対応端末のみ）
  if (typeof data.count === 'number' && self.navigator.setAppBadge) {
    tasks.push(self.navigator.setAppBadge(data.count).catch(() => {}))
  }
  event.waitUntil(Promise.all(tasks))
})

// 通知をタップしたら、開いているアプリを前に出して復習画面へ。開いていなければ新しく開く
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin))
      if (!open) return self.clients.openWindow(url)
      await open.focus()
      return open.navigate(url).catch(() => self.clients.openWindow(url))
    }),
  )
})
