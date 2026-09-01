import type { ReactNode } from 'react'
import type { useJournalEntries } from '../lib/useJournalEntries'
import { buildWeeklyReview } from '../lib/analytics'
import { formatDateLabel } from '../lib/dateUtils'
import { PageHeader } from '../components/PageHeader'

interface Props {
  journal: ReturnType<typeof useJournalEntries>
}

export function WeeklyReview({ journal }: Props) {
  const { entries } = journal
  const review = buildWeeklyReview(entries)

  return (
    <div>
      <PageHeader title="每週回顧" subtitle="最近 7 天的自己" />

      <div className="card mb-6 bg-sage-50/70 border-sage-200/60">
        <p className="text-xs text-sage-600 font-medium mb-2">本週的我</p>
        <p className="text-stone-700 leading-relaxed">{review.summary}</p>
      </div>

      {review.days.length === 0 ? (
        <p className="text-stone-400 text-center py-10">這週還沒有紀錄，寫下第一篇看看吧</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="平均心情" value={review.avgMood !== null ? review.avgMood.toFixed(1) : '–'} />
            <MiniStat
              label="心情最高"
              value={review.bestDay ? review.bestDay.mood.toString() : '–'}
              hint={review.bestDay ? formatDateLabel(review.bestDay.date) : undefined}
            />
            <MiniStat
              label="心情最低"
              value={review.worstDay ? review.worstDay.mood.toString() : '–'}
              hint={review.worstDay ? formatDateLabel(review.worstDay.date) : undefined}
            />
          </div>

          {review.topEmotions.length > 0 && (
            <Section title="最常出現的情緒">
              <div className="flex flex-wrap gap-2">
                {review.topEmotions.map((e) => (
                  <span
                    key={e.emotion}
                    className="rounded-full bg-white border border-stone-200 px-3 py-1.5 text-sm text-stone-600"
                  >
                    {e.emotion} × {e.count}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {review.recurringThemes.length > 0 && (
            <Section title="反覆出現、值得注意的主題">
              <div className="flex flex-wrap gap-2">
                {review.recurringThemes.map((t) => (
                  <span
                    key={t.keyword}
                    className="rounded-full bg-clay-100 px-3 py-1.5 text-sm text-clay-500"
                  >
                    {t.keyword}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <HighlightList title="這週讓我開心的事情" items={review.happyHighlights} />
          <HighlightList title="這週讓我不舒服的事情" items={review.upsetHighlights} />
          <HighlightList title="這週我最常感謝的事情" items={review.gratefulHighlights} />
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card !p-4 text-center">
      <p className="text-xs text-stone-400 mb-1.5">{label}</p>
      <p className="text-lg font-semibold text-stone-800">{value}</p>
      {hint && <p className="text-[11px] text-stone-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-stone-600 mb-2">{title}</p>
      {children}
    </div>
  )
}

function HighlightList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <Section title={title}>
      <ul className="card !p-4 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-stone-600 leading-relaxed">
            · {item}
          </li>
        ))}
      </ul>
    </Section>
  )
}
