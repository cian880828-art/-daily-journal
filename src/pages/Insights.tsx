import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { useJournalEntries } from '../lib/useJournalEntries'
import { buildMonthlyInsights } from '../lib/analytics'
import { analyzeMonth, computeFingerprint } from '../lib/aiClient'
import { useAiInsight } from '../lib/useAiInsight'
import type { AiMonthlyInsight } from '../types/aiInsight'
import { PageHeader } from '../components/PageHeader'

interface Props {
  journal: ReturnType<typeof useJournalEntries>
}

const SAGE = '#728a5e'
const CLAY = '#c2876a'

export function Insights({ journal }: Props) {
  const { entries } = journal
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })

  const insights = useMemo(() => buildMonthlyInsights(entries, cursor), [entries, cursor])
  const isCurrentMonth =
    cursor.getFullYear() === new Date().getFullYear() && cursor.getMonth() === new Date().getMonth()

  const monthKey = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`
  const fingerprint = computeFingerprint(insights.entries)
  const ai = useAiInsight<AiMonthlyInsight>(`monthly:${monthKey}`, fingerprint, () =>
    analyzeMonth(insights.entries),
  )

  return (
    <div>
      <PageHeader title="月回顧" subtitle="慢慢認識自己的樣子" />

      <Link
        to="/reflections"
        className="card !p-4 mb-6 flex items-center justify-between text-sage-600 text-sm font-medium"
      >
        查看感謝清單與自我肯定紀錄
        <span aria-hidden>→</span>
      </Link>

      <div className="flex items-center justify-between mb-6">
        <button
          className="h-8 w-8 flex items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          aria-label="上個月"
        >
          ‹
        </button>
        <p className="font-medium text-stone-700">
          {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
        </p>
        <button
          className="h-8 w-8 flex items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 disabled:opacity-30"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          disabled={isCurrentMonth}
          aria-label="下個月"
        >
          ›
        </button>
      </div>

      {insights.entries.length === 0 ? (
        <p className="text-stone-400 text-center py-16">這個月還沒有紀錄</p>
      ) : (
        <div className="space-y-5">
          <div className="card bg-sage-50/70 border-sage-200/60">
            <p className="text-xs text-sage-600 font-medium mb-2">這個月的我</p>
            <p className="text-stone-700 leading-relaxed">{insights.summary}</p>
          </div>

          {insights.emotionCounts.length > 0 && (
            <Block title="這個月最常出現的情緒">
              <ResponsiveContainer width="100%" height={Math.max(120, insights.emotionCounts.length * 32)}>
                <BarChart
                  data={insights.emotionCounts}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="emotion"
                    tick={{ fontSize: 12, fill: '#5c5245' }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e8e3da', fontSize: 12 }} />
                  <Bar dataKey="count" fill={CLAY} radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </Block>
          )}

          {insights.recurringThemes.length > 0 && (
            <Block title="反覆出現的主題">
              <div className="flex flex-wrap gap-2">
                {insights.recurringThemes.map((t) => (
                  <span key={t.keyword} className="rounded-full bg-clay-100 px-3 py-1.5 text-sm text-clay-500">
                    {t.keyword}
                  </span>
                ))}
              </div>
            </Block>
          )}

          <AiSection ai={ai} />

          <ChartCard title="每日心情">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={insights.dailyMoodSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e3da" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#958974' }} axisLine={false} tickLine={false} />
                <YAxis domain={[1, 10]} tick={{ fontSize: 11, fill: '#958974' }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e8e3da', fontSize: 12 }} />
                <Line type="monotone" dataKey="mood" stroke={SAGE} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {insights.weeklyAverages.length > 1 && (
            <ChartCard title="每週平均心情">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={insights.weeklyAverages} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e3da" vertical={false} />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 11, fill: '#958974' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[1, 10]} tick={{ fontSize: 11, fill: '#958974' }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e8e3da', fontSize: 12 }} />
                  <Bar dataKey="avgMood" fill={SAGE} radius={[6, 6, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}
    </div>
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
  if (!value.trim()) return null
  return (
    <Block title={title} highlight={highlight}>
      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{value}</p>
    </Block>
  )
}

function AiSection({ ai }: { ai: ReturnType<typeof useAiInsight<AiMonthlyInsight>> }) {
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
          <AiField title="這個月看見的模式" value={cached.result.patterns} />
          <AiField title="我真正需要的是什麼" value={cached.result.coreNeed} />
          <AiField title="什麼最容易消耗我" value={cached.result.whatDrains} />
          <AiField title="什麼真的讓我恢復" value={cached.result.whatRestores} />
          <AiField title="這個月有什麼變了" value={cached.result.whatChanged} />
          <AiField title="最近的我" value={cached.result.recentSelf} />
          <AiField title="下個月值得觀察的一件事" value={cached.result.nextMonthWatch} highlight />
        </>
      )}
    </>
  )
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card">
      <p className="text-sm font-medium text-stone-600 mb-3">{title}</p>
      {children}
    </div>
  )
}
