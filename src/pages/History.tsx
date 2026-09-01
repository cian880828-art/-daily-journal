import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { useJournalEntries } from '../lib/useJournalEntries'
import { formatDateLabel, toDateKey, todayKey } from '../lib/dateUtils'
import { PageHeader } from '../components/PageHeader'

interface Props {
  journal: ReturnType<typeof useJournalEntries>
}

const MOOD_DOT = (mood: number) => {
  if (mood >= 8) return 'bg-sage-500'
  if (mood >= 6) return 'bg-sage-300'
  if (mood >= 4) return 'bg-clay-200'
  return 'bg-clay-400'
}

export function History({ journal }: Props) {
  const { entries } = journal
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })

  const entryByDate = useMemo(() => {
    const map = new Map<string, (typeof entries)[number]>()
    for (const e of entries) map.set(e.date, e)
    return map
  }, [entries])

  return (
    <div>
      <PageHeader title="歷史紀錄" subtitle="回頭看看走過的日子" />

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setView('calendar')}
          className={view === 'calendar' ? 'btn-secondary !bg-sage-100 !border-sage-300 !text-sage-600' : 'btn-secondary'}
        >
          月曆
        </button>
        <button
          onClick={() => setView('list')}
          className={view === 'list' ? 'btn-secondary !bg-sage-100 !border-sage-300 !text-sage-600' : 'btn-secondary'}
        >
          列表
        </button>
      </div>

      {view === 'calendar' ? (
        <CalendarView cursor={cursor} setCursor={setCursor} entryByDate={entryByDate} />
      ) : (
        <ListView entries={entries} />
      )}
    </div>
  )
}

function CalendarView({
  cursor,
  setCursor,
  entryByDate,
}: {
  cursor: Date
  setCursor: (d: Date) => void
  entryByDate: Map<string, ReturnType<typeof useJournalEntries>['entries'][number]>
}) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = todayKey()

  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateKey(new Date(year, month, i + 1))),
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          className="h-8 w-8 flex items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="上個月"
        >
          ‹
        </button>
        <p className="font-medium text-stone-700">
          {year} 年 {month + 1} 月
        </p>
        <button
          className="h-8 w-8 flex items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 disabled:opacity-30"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          disabled={year === new Date().getFullYear() && month === new Date().getMonth()}
          aria-label="下個月"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-stone-400 mb-2">
        {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {cells.map((key, i) => {
          if (!key) return <div key={`empty-${i}`} />
          const entry = entryByDate.get(key)
          const isFuture = key > today
          const day = Number(key.split('-')[2])
          const content = (
            <div
              className={`mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-sm
                ${key === today ? 'ring-1 ring-sage-400' : ''}
                ${entry ? 'text-stone-700 font-medium' : 'text-stone-400'}`}
            >
              {day}
              {entry && <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${MOOD_DOT(entry.mood)}`} />}
            </div>
          )
          return isFuture ? (
            <div key={key}>{content}</div>
          ) : (
            <Link key={key} to={`/entry/${key}`} className="active:scale-95 transition">
              {content}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function ListView({ entries }: { entries: ReturnType<typeof useJournalEntries>['entries'] }) {
  if (entries.length === 0) {
    return <p className="text-stone-400 text-center py-16">還沒有任何紀錄</p>
  }
  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.date}>
          <Link to={`/entry/${e.date}`} className="card !p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-700">{formatDateLabel(e.date)}</p>
              <p className="text-sm text-stone-500 mt-1 line-clamp-1">
                {e.happy || e.grateful || e.noteToSelf || '（今天沒有寫下太多文字）'}
              </p>
            </div>
            <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${MOOD_DOT(e.mood)}`} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
