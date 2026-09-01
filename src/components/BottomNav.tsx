import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/', label: '首頁', icon: HomeIcon, end: true },
  { to: '/history', label: '歷史', icon: CalendarIcon, end: false },
  { to: '/weekly', label: '週回顧', icon: SparkleIcon, end: false },
  { to: '/insights', label: 'Insights', icon: ChartIcon, end: false },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20 bg-paper/90 backdrop-blur border-t border-stone-200
        pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto max-w-md grid grid-cols-4">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-xs transition ${
                isActive ? 'text-sage-600' : 'text-stone-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon active={isActive} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16" strokeLinecap="round" />
      <path d="M8 3.5v3M16 3.5v3" strokeLinecap="round" />
    </svg>
  )
}

function SparkleIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" strokeLinecap="round" />
      <path d="M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path d="M5 19V10M12 19V5M19 19v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
