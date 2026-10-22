import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TabBar } from './components/TabBar'
import { countDueMemos } from './lib/memos'
import { useData } from './lib/useData'
import { useToday } from './lib/useNow'
import { useSession } from './lib/useSession'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MemoEditPage } from './pages/MemoEditPage'
import { MemoListPage } from './pages/MemoListPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const session = useSession()
  if (session === undefined) return null
  if (!session) return <LoginPage />
  return <MainApp />
}

function MainApp() {
  const today = useToday()
  // バッジ用なので、読み込めなかったときは 0 件として扱う
  const dueCount = useData(() => countDueMemos().catch(() => 0), [today])

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
          <PageErrorBoundary>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/memos" element={<MemoListPage />} />
              <Route path="/memos/new" element={<MemoEditPage />} />
              <Route path="/memos/:id" element={<MemoEditPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </PageErrorBoundary>
        </main>
        <TabBar dueCount={dueCount ?? 0} />
      </div>
    </BrowserRouter>
  )
}

/** 別の画面に移ったら、エラー表示を消して読み込み直す */
function PageErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary key={useLocation().pathname}>{children}</ErrorBoundary>
}
