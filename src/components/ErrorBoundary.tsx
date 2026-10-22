import { Component, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { notifyChange } from '../lib/useData'

/** 読み込みに失敗したとき、画面を真っ白にせず再読み込みボタンを出す */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  retry = () => {
    this.setState({ failed: false })
    notifyChange()
  }

  render() {
    return this.state.failed ? <ErrorNotice onRetry={this.retry} /> : this.props.children
  }
}

function ErrorNotice({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-slate-600 dark:text-slate-300">{t.common.loadFailed}</p>
      <button onClick={onRetry} className="rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white">
        {t.common.retry}
      </button>
    </div>
  )
}
