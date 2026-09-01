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
      <PageHeader title="Insights" subtitle="慢慢認識自己的樣子" />

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
        <div className="space-y-8">
          <TextInsights insights={insights} />

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

          <ChartCard title="各情緒出現次數">
            <ResponsiveContainer width="100%" height={Math.max(160, insights.emotionCounts.length * 32)}>
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

function AiSection({ ai }: { ai: ReturnType<typeof useAiInsight<AiMonthlyInsight>> }) {
  const { cached, stale, loading, error, analyze, apiKeyConfigured } = ai

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
    <div className="card bg-clay-100/40 border-clay-200/60">
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

      {loading && !cached && <p className="text-sm text-stone-400 py-2">分析中，請稍候…</p>}

      {error && <p className="text-sm text-clay-500 mt-2">{error}</p>}

      {cached && (
        <div className="space-y-3">
          {stale && <p className="text-xs text-stone-400">紀錄有更新，這是上次的分析結果</p>}
          <p className="text-sm text-stone-700 leading-relaxed">{cached.result.emotionAnalysis}</p>

          <div>
            <p className="text-xs font-medium text-stone-500 mb-1">什麼最容易讓你開心</p>
            <p className="text-sm text-stone-600 leading-relaxed">{cached.result.happyPatterns}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-stone-500 mb-1">什麼最容易讓你焦慮</p>
            <p className="text-sm text-stone-600 leading-relaxed">{cached.result.anxietyPatterns}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-stone-500 mb-1">最近的趨勢</p>
            <p className="text-sm text-stone-600 leading-relaxed">{cached.result.trend}</p>
          </div>

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

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card">
      <p className="text-sm font-medium text-stone-600 mb-3">{title}</p>
      {children}
    </div>
  )
}

function TextInsights({ insights }: { insights: ReturnType<typeof buildMonthlyInsights> }) {
  const lines: string[] = []

  if (insights.happyKeywords.length > 0) {
    lines.push(`什麼最容易讓我開心？　${insights.happyKeywords.map((k) => k.keyword).join('、')}`)
  }
  if (insights.upsetKeywords.length > 0) {
    lines.push(`什麼最容易讓我焦慮／不舒服？　${insights.upsetKeywords.map((k) => k.keyword).join('、')}`)
  }
  if (insights.gratefulKeywords.length > 0) {
    lines.push(`我最常感謝的人事物？　${insights.gratefulKeywords.map((k) => k.keyword).join('、')}`)
  }
  if (insights.lowMoodWeekdays.length > 0) {
    lines.push(`低心情通常出現在？　${insights.lowMoodWeekdays.slice(0, 2).map((w) => w.weekday).join('、')}`)
  }

  const trendText =
    insights.trend === 'up'
      ? '最近情緒正在變好 ↗'
      : insights.trend === 'down'
        ? '最近情緒有些下滑 ↘，多照顧自己'
        : insights.trend === 'flat'
          ? '最近情緒大致平穩 →'
          : '再累積一些紀錄，就能看出情緒趨勢'
  lines.push(`最近的情緒趨勢？　${trendText}`)

  return (
    <div className="card bg-stone-50/70">
      <p className="text-xs text-stone-500 font-medium mb-3">這個月，我發現…</p>
      <ul className="space-y-2.5">
        {lines.map((line, i) => (
          <li key={i} className="text-sm text-stone-600 leading-relaxed">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
