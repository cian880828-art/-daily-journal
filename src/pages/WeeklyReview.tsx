import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { useJournalEntries } from '../lib/useJournalEntries'
import { buildWeeklyReview } from '../lib/analytics'
import { todayKey } from '../lib/dateUtils'
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

      {review.days.length === 0 ? (
        <p className="text-stone-400 text-center py-10">這週還沒有紀錄，寫下第一篇看看吧</p>
      ) : (
        <div className="space-y-5">
          <div className="card bg-sage-50/70 border-sage-200/60">
            <p className="text-xs text-sage-600 font-medium mb-2">本週的我</p>
            <p className="text-stone-700 leading-relaxed">{review.summary}</p>
          </div>

          {review.topEmotions.length > 0 && (
            <Block title="最常出現的情緒">
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
            </Block>
          )}

          <AiSection ai={ai} />

          <HighlightList title="這週讓我開心的事情" items={review.happyHighlights} />
          <HighlightList title="這週讓我不舒服的事情" items={review.upsetHighlights} />
          <HighlightList title="這週我最常感謝的事情" items={review.gratefulHighlights} />
        </div>
      )}
    </div>
  )
}

function HighlightList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <Block title={title}>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-stone-600 leading-relaxed">
            · {item}
          </li>
        ))}
      </ul>
    </Block>
  )
}

function Block({ title, highlight, children }: { title: string; highlight?: boolean; children: ReactNode }) {
  return (
    <div className={highlight ? 'card bg-clay-100/60 border-clay-200/70' : 'card'}>
      <p className={highlight ? 'text-xs font-medium text-clay-600 mb-2' : 'text-xs font-medium text-stone-500 mb-2'}>
        {title}
      </p>
      {children}
    </div>
  )
}

function AiField({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  // A cached result from before this block architecture shipped can still
  // be sitting in localStorage under the old field names — guard against
  // that (value undefined) rather than crashing the whole page on it.
  if (!value?.trim()) return null
  return (
    <Block title={title} highlight={highlight}>
      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{value}</p>
    </Block>
  )
}

function AiSection({ ai }: { ai: ReturnType<typeof useAiInsight<AiWeeklyInsight>> }) {
  const { cached, stale, loading, error, analyze, apiKeyConfigured, progressLabel } = ai

  if (!apiKeyConfigured) {
    return (
      <div className="card bg-stone-50/70">
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
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-clay-500 font-medium">AI 觀察</p>
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

      {error && <p className="text-sm text-clay-500">{error}</p>}

      {cached && (
        <>
          {stale && <p className="text-xs text-stone-400">紀錄有更新，這是上次的分析結果</p>}
          <AiField title="真正影響我的事" value={cached.result.realEvents} />
          <AiField title="這週看見的模式" value={cached.result.patterns} />
          <AiField title="什麼讓我變好一點" value={cached.result.whatHelped} />
          <AiField title="原本擔心 vs 實際發生" value={cached.result.expectedVsActual} />
          <AiField title="下週值得觀察的一件事" value={cached.result.nextWeekWatch} highlight />
        </>
      )}
    </>
  )
}
