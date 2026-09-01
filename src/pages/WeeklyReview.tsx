import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { useJournalEntries } from '../lib/useJournalEntries'
import { buildWeeklyReview } from '../lib/analytics'
import { formatDateLabel, todayKey } from '../lib/dateUtils'
import { analyzeWeek, computeFingerprint } from '../lib/aiClient'
import { useAiInsight } from '../lib/useAiInsight'
import type { AiWeeklyInsight } from '../types/aiInsight'
import { PageHeader } from '../components/PageHeader'

interface Props {
  journal: ReturnType<typeof useJournalEntries>
}

export function WeeklyReview({ journal }: Props) {
  const { entries } = journal
  const review = buildWeeklyReview(entries)
  const fingerprint = computeFingerprint(review.days)
  const ai = useAiInsight<AiWeeklyInsight>(`weekly:${todayKey()}`, fingerprint, () => analyzeWeek(review.days))

  return (
    <div>
      <PageHeader title="每週回顧" subtitle="最近 7 天的自己" />

      <div className="card mb-6 bg-sage-50/70 border-sage-200/60">
        <p className="text-xs text-sage-600 font-medium mb-2">本週的我</p>
        <p className="text-stone-700 leading-relaxed">{review.summary}</p>
      </div>

      {review.days.length > 0 && <AiSection ai={ai} />}

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

function AiSection({ ai }: { ai: ReturnType<typeof useAiInsight<AiWeeklyInsight>> }) {
  const { cached, stale, loading, error, analyze, apiKeyConfigured, progressLabel } = ai

  if (!apiKeyConfigured) {
    return (
      <div className="card mb-6 bg-stone-50/70">
        <p className="text-sm text-stone-600 mb-2">想要更深入的 AI 情緒分析與建議嗎？</p>
        <p className="text-xs text-stone-400 mb-3">
          免費申請一組 Gemini API Key 就能使用，資料只會從你的瀏覽器直接送到 Google。
        </p>
        <Link to="/settings" className="btn-secondary inline-flex">
          前往設定
        </Link>
      </div>
    )
  }

  return (
    <div className="card mb-6 bg-clay-100/40 border-clay-200/60">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-clay-500 font-medium">AI 情緒分析與建議</p>
        {cached && (
          <button
            type="button"
            onClick={analyze}
            disabled={loading}
            className="text-xs text-stone-400 underline disabled:opacity-50"
          >
            {loading ? '分析中…' : '重新分析'}
          </button>
        )}
      </div>

      {!cached && !loading && (
        <button type="button" onClick={analyze} className="btn-primary w-full">
          開始 AI 分析
        </button>
      )}

      {loading && !cached && <p className="text-sm text-stone-400 py-2">{progressLabel}</p>}

      {error && <p className="text-sm text-clay-500 mt-2">{error}</p>}

      {cached && (
        <div className="space-y-3">
          {stale && <p className="text-xs text-stone-400">紀錄有更新，這是上次的分析結果</p>}
          <p className="text-sm text-stone-700 leading-relaxed">{cached.result.emotionAnalysis}</p>

          {cached.result.stressors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1.5">可能的壓力來源</p>
              <ul className="space-y-1">
                {cached.result.stressors.map((s, i) => (
                  <li key={i} className="text-sm text-stone-600 leading-relaxed">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cached.result.suggestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1.5">建議</p>
              <ul className="space-y-1">
                {cached.result.suggestions.map((s, i) => (
                  <li key={i} className="text-sm text-stone-600 leading-relaxed">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-sm text-clay-500 italic">{cached.result.encouragement}</p>
        </div>
      )}
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
