import { Link } from 'react-router-dom'
import type { useJournalEntries } from '../lib/useJournalEntries'
import { computeHomeStats, findTimeCapsuleEntry } from '../lib/analytics'
import { todayKey, formatDateLabel } from '../lib/dateUtils'
import { DailyPromptCard } from '../components/DailyPromptCard'

interface Props {
  journal: ReturnType<typeof useJournalEntries>
}

export function Home({ journal }: Props) {
  const { entries, loading } = journal
  const today = todayKey()
  const todayEntry = entries.find((e) => e.date === today)
  const stats = computeHomeStats(entries)
  const timeCapsule = findTimeCapsuleEntry(entries, today)

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm text-stone-400">{formatDateLabel(today)}</p>
        <Link
          to="/settings"
          aria-label="設定"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 active:scale-95 transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-stone-800 mb-8">今天過得怎麼樣？</h1>

      {loading ? (
        <div className="card animate-pulse h-40" />
      ) : todayEntry ? (
        <div className="card mb-8">
          <p className="text-stone-700 text-lg mb-4">今天已經留下紀錄了 ♡</p>
          <div className="flex gap-3">
            <Link to={`/entry/${today}`} className="btn-primary flex-1">
              查看 / 編輯
            </Link>
          </div>
        </div>
      ) : (
        <div className="card mb-8 text-center py-10">
          <p className="text-stone-500 mb-6">花 2～5 分鐘，寫下今天的心情</p>
          <Link to="/entry" className="btn-primary px-10">
            開始今天的紀錄
          </Link>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="連續紀錄" value={`${stats.streak}`} unit="天" />
        <StatCard label="本月紀錄" value={`${stats.monthCount}`} unit="天" />
        <StatCard
          label="近 7 天平均"
          value={stats.last7DaysAvgMood !== null ? stats.last7DaysAvgMood.toFixed(1) : '–'}
          unit="分"
        />
      </div>

      {todayEntry && (
        <div className="card mt-6">
          <p className="text-xs font-medium text-stone-500 mb-3">今天的你</p>
          <div className="flex items-center gap-4 mb-3">
            <p className="text-2xl font-semibold text-stone-800">
              {todayEntry.mood}
              <span className="text-sm font-normal text-stone-400"> / 10</span>
            </p>
            {todayEntry.emotions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {todayEntry.emotions.map((emotion) => (
                  <span key={emotion} className="rounded-full bg-sage-50 px-2.5 py-1 text-xs text-sage-600">
                    {emotion}
                  </span>
                ))}
              </div>
            )}
          </div>
          {todayEntry.grateful.trim() && (
            <p className="text-sm text-stone-600 leading-relaxed line-clamp-2">
              感謝：{todayEntry.grateful.trim()}
            </p>
          )}
        </div>
      )}

      <DailyPromptCard />

      {timeCapsule && (
        <Link
          to={`/entry/${timeCapsule.entry.date}`}
          className="card mt-6 block bg-sage-50/70 border-sage-200/60"
        >
          <p className="text-xs text-sage-600 font-medium mb-2">{timeCapsule.label}</p>
          <p className="text-sm text-stone-700 leading-relaxed">{timeCapsule.entry.noteToSelf}</p>
        </Link>
      )}
    </div>
  )
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card !p-3 text-center">
      <p className="text-xs text-stone-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-stone-800">
        {value}
        <span className="text-xs font-normal text-stone-400 ml-0.5">{unit}</span>
      </p>
    </div>
  )
}
