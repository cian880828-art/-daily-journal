import { useState } from 'react'
import type { useJournalEntries } from '../lib/useJournalEntries'
import { collectReflections, type ReflectionField } from '../lib/analytics'
import { formatDateLabel } from '../lib/dateUtils'
import { PageHeader } from '../components/PageHeader'

interface Props {
  journal: ReturnType<typeof useJournalEntries>
}

const TABS: { field: ReflectionField; label: string; emptyHint: string }[] = [
  { field: 'grateful', label: '感謝清單', emptyHint: '之後每天寫下感謝的事，會慢慢收集在這裡' },
  { field: 'proudOf', label: '自我肯定紀錄', emptyHint: '之後每天寫下做得不錯的事，會慢慢收集在這裡' },
]

export function Reflections({ journal }: Props) {
  const { entries } = journal
  const [field, setField] = useState<ReflectionField>('grateful')

  const activeTab = TABS.find((t) => t.field === field)!
  const groups = collectReflections(entries, field)
  const total = groups.reduce((sum, g) => sum + g.items.length, 0)

  return (
    <div>
      <PageHeader title="回顧語錄" subtitle="慢慢累積的、關於你的紀錄" back />

      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.field}
            onClick={() => setField(t.field)}
            className={
              field === t.field
                ? 'btn-secondary !bg-sage-100 !border-sage-300 !text-sage-600'
                : 'btn-secondary'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <p className="text-stone-400 text-center py-16">{activeTab.emptyHint}</p>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-stone-400">
            目前累積了 {total} 則{field === 'grateful' ? '感謝' : '肯定自己'}的紀錄
          </p>
          {groups.map((group) => (
            <div key={group.monthLabel}>
              <p className="text-xs font-medium text-stone-500 mb-2">{group.monthLabel}</p>
              <ul className="card !p-4 space-y-3">
                {group.items.map((item, i) => (
                  <li key={i}>
                    <p className="text-[11px] text-stone-400">{formatDateLabel(item.date)}</p>
                    <p className="text-sm text-stone-700 leading-relaxed">{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
