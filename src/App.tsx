import { Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { useJournalEntries } from './lib/useJournalEntries'
import { Home } from './pages/Home'
import { DailyEntry } from './pages/DailyEntry'
import { History } from './pages/History'
import { WeeklyReview } from './pages/WeeklyReview'
import { Insights } from './pages/Insights'

export default function App() {
  const journal = useJournalEntries()

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-md px-5 pt-8 pb-28">
        <Routes>
          <Route path="/" element={<Home journal={journal} />} />
          <Route path="/entry" element={<DailyEntry journal={journal} />} />
          <Route path="/entry/:date" element={<DailyEntry journal={journal} />} />
          <Route path="/history" element={<History journal={journal} />} />
          <Route path="/weekly" element={<WeeklyReview journal={journal} />} />
          <Route path="/insights" element={<Insights journal={journal} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  )
}
