import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TabBar } from './components/TabBar'
import { useI18n } from './i18n'
import { supabase } from './lib/db'
import { countDueCards } from './lib/maps'
import { countDueMemos } from './lib/memos'
import { isMissingSchema } from './lib/query'
import { useData } from './lib/useData'
import { useToday } from './lib/useNow'
import { useSession } from './lib/useSession'
import { CapturePage } from './pages/CapturePage'
import { FlashPage } from './pages/FlashPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MapListPage } from './pages/MapListPage'
import { MapPage } from './pages/MapPage'
import { MapReviewPage } from './pages/MapReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { WordEditPage } from './pages/WordEditPage'
import { WordListPage } from './pages/WordListPage'
import { WordReviewPage } from './pages/WordReviewPage'

export default function App() {
  const session = useSession()
  if (session === undefined) return null
  if (!session) return <LoginPage />
  return <MainApp />
}

/** マインドマップのテーブルがあるか（schema.sql を実行したか）。確かめている間は undefined */
function useSchemaReady(): boolean | undefined {
  const [ready, setReady] = useState<boolean>()
  useEffect(() => {
    supabase
      .from('maps')
      .select('id')
      .limit(1)
      // 通信できないときなどは、それぞれの画面でエラーを出す
      .then(({ error }) => setReady(!(error && isMissingSchema(error))))
  }, [])
  return ready
}

function MainApp() {
  const today = useToday()
  const schemaReady = useSchemaReady()
  // バッジ用なので、読み込めなかったときは 0 件として扱う
  const dueCount = useData(() => Promise.all([countDueCards(), countDueMemos()]).then(([cards, words]) => cards + words, () => 0), [today])

  // ホーム画面のアプリアイコンに復習件数のバッジを付ける（対応端末のみ）
  useEffect(() => {
    if (dueCount === undefined || !('setAppBadge' in navigator)) return
    const task = dueCount > 0 ? navigator.setAppBadge(dueCount) : navigator.clearAppBadge()
    task.catch(() => {})
  }, [dueCount])

  if (schemaReady === undefined) return null
  if (!schemaReady) return <DbUpdateNotice />

  return (
    <BrowserRouter>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <main className="flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
          <PageErrorBoundary>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/maps" element={<MapListPage />} />
              <Route path="/maps/:id" element={<MapPage />} />
              <Route path="/capture" element={<CapturePage />} />
              <Route path="/review" element={<MapReviewPage />} />
              <Route path="/words" element={<WordListPage />} />
              <Route path="/words/new" element={<WordEditPage />} />
              <Route path="/words/review" element={<WordReviewPage />} />
              <Route path="/words/:id" element={<WordEditPage />} />
              <Route path="/flash" element={<FlashPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              {/* 前のバージョンの URL（ホーム画面のブックマークなど） */}
              <Route path="/memos" element={<Navigate to="/words" replace />} />
              <Route path="/memos/:id" element={<OldMemoRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PageErrorBoundary>
        </main>
        <TabBar dueCount={dueCount ?? 0} />
      </div>
    </BrowserRouter>
  )
}

function OldMemoRedirect() {
  const { id } = useParams()
  return <Navigate to={`/words/${id}`} replace />
}

/** schema.sql をまだ実行していないときの案内 */
function DbUpdateNotice() {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold">{t.dbUpdate.title}</h1>
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t.dbUpdate.body}</p>
      <button onClick={() => location.reload()} className="rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white">
        {t.dbUpdate.reload}
      </button>
    </div>
  )
}

/** 別の画面に移ったら、エラー表示を消して読み込み直す */
function PageErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary key={useLocation().pathname}>{children}</ErrorBoundary>
}
