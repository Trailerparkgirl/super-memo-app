import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { dueMemosQuery } from './lib/memos'
import { useToday } from './lib/useNow'
import { HomePage } from './pages/HomePage'
import { MemoEditPage } from './pages/MemoEditPage'
import { MemoListPage } from './pages/MemoListPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const today = useToday()
  const dueCount = useLiveQuery(() => dueMemosQuery().count(), [today])

  // ホーム画面のアプリアイコンに復習件数のバッジを付ける（対応端末のみ）
  useEffect(() => {
    if (dueCount === undefined || !('setAppBadge' in navigator)) return
    const task = dueCount > 0 ? navigator.setAppBadge(dueCount) : navigator.clearAppBadge()
    task.catch(() => {})
  }, [dueCount])

  return (
    <BrowserRouter>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <main className="flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/memos" element={<MemoListPage />} />
            <Route path="/memos/new" element={<MemoEditPage />} />
            <Route path="/memos/:id" element={<MemoEditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <TabBar dueCount={dueCount ?? 0} />
      </div>
    </BrowserRouter>
  )
}
