import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { useJournalEntries } from './lib/useJournalEntries'
import { useAuth } from './lib/useAuth'
import { migrateLocalDataToCloud } from './lib/migrateLocalData'
import { syncAiSettingsFromCloud } from './lib/supabaseAiSettings'
import { Home } from './pages/Home'
import { DailyEntry } from './pages/DailyEntry'
import { History } from './pages/History'
import { WeeklyReview } from './pages/WeeklyReview'
import { Insights } from './pages/Insights'
import { Reflections } from './pages/Reflections'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'

export default function App() {
  const { user, loading: authLoading, signInWithGoogle, signInWithOtp, verifyOtp } = useAuth()
  const [migrating, setMigrating] = useState(false)

  useEffect(() => {
    if (!user) return
    setMigrating(true)
    Promise.all([
      migrateLocalDataToCloud(user.id),
      syncAiSettingsFromCloud().catch((err) => console.error('[daily-journal] AI settings sync failed:', err)),
    ])
      .catch((err) => console.error('[daily-journal] local data migration failed:', err))
      .finally(() => setMigrating(false))
  }, [user])

  if (authLoading || migrating) {
    return <div className="min-h-screen bg-paper" />
  }

  if (!user) {
    return <Login onSignInWithGoogle={signInWithGoogle} onSendCode={signInWithOtp} onVerifyCode={verifyOtp} />
  }

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const journal = useJournalEntries()
  const location = useLocation()
  // The entry form is long (7 fields + mood + emotions + AI section) and
  // single-purpose — a fixed bottom nav would sit on top of its content
  // while scrolling, so it's hidden on this route rather than fought with
  // extra scroll-padding tricks. The header's back button is the way out.
  const showNav = !location.pathname.startsWith('/entry')

  return (
    <div className="min-h-screen bg-paper">
      <div className={`mx-auto max-w-md px-5 pt-8 ${showNav ? 'pb-28' : 'pb-10'}`}>
        <Routes>
          <Route path="/" element={<Home journal={journal} />} />
          <Route path="/entry" element={<DailyEntry journal={journal} />} />
          <Route path="/entry/:date" element={<DailyEntry journal={journal} />} />
          <Route path="/history" element={<History journal={journal} />} />
          <Route path="/weekly" element={<WeeklyReview journal={journal} />} />
          <Route path="/insights" element={<Insights journal={journal} />} />
          <Route path="/reflections" element={<Reflections journal={journal} />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {showNav && <BottomNav />}
    </div>
  )
}
