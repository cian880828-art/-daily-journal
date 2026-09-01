import { Link } from 'react-router-dom'
import type { useJournalEntries } from '../lib/useJournalEntries'
import { computeHomeStats } from '../lib/analytics'
import { todayKey, formatDateLabel } from '../lib/dateUtils'

interface Props {
  journal: ReturnType<typeof useJournalEntries>
}

export function Home({ journal }: Props) {
  const { entries, loading } = journal
  const today = todayKey()
  const todayEntry = entries.find((e) => e.date === today)
  const stats = computeHomeStats(entries)

  return (
    <div>
      <p className="text-sm text-stone-400 mb-1">{formatDateLabel(today)}</p>
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
    </div>
  )
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card !p-4 text-center">
      <p className="text-xs text-stone-400 mb-1.5">{label}</p>
      <p className="text-xl font-semibold text-stone-800">
        {value}
        <span className="text-xs font-normal text-stone-400 ml-0.5">{unit}</span>
      </p>
    </div>
  )
}
