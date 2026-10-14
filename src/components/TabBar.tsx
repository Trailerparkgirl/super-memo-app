import { NavLink, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'

const icons = {
  home: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  memos: 'M7 4h10a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 012-2zM9 9h6M9 13h4',
  plus: 'M12 5v14M5 12h14',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
}

export function Icon({ d, className = 'size-6' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  )
}

function Tab({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`
      }
    >
      <Icon d={icon} />
      {label}
      {!!badge && (
        <span className="absolute top-1 left-1/2 ml-2 min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[11px] leading-5 font-semibold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

export function TabBar({ dueCount }: { dueCount: number }) {
  const { t } = useI18n()
  // 復習中は集中できるようタブバーを隠す
  if (useLocation().pathname === '/review') return null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto flex max-w-xl items-end">
        <Tab to="/" icon={icons.home} label={t.tabs.review} badge={dueCount} />
        <Tab to="/memos" icon={icons.memos} label={t.tabs.memos} />
        <NavLink to="/memos/new" className="flex flex-1 justify-center py-1.5" aria-label={t.tabs.newMemo}>
          <span className="grid size-12 place-items-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <Icon d={icons.plus} className="size-7" />
          </span>
        </NavLink>
        <Tab to="/settings" icon={icons.settings} label={t.tabs.settings} />
      </div>
    </nav>
  )
}
