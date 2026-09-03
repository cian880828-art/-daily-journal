import type { Emotion, JournalEntry } from '../types/journal'
import {
  computeStreak,
  formatShort,
  isSameMonth,
  lastNDays,
  parseDateKey,
  subtractMonths,
  todayKey,
} from './dateUtils'

export interface HomeStats {
  streak: number
  monthCount: number
  last7DaysAvgMood: number | null
}

export function computeHomeStats(allEntries: JournalEntry[]): HomeStats {
  const dateKeys = new Set(allEntries.map((e) => e.date))
  const streak = computeStreak(dateKeys)

  const today = parseDateKey(todayKey())
  const monthCount = allEntries.filter((e) => isSameMonth(e.date, today.getFullYear(), today.getMonth()))
    .length

  const recentWindow = new Set(lastNDays(7))
  const recentMoods = allEntries.filter((e) => recentWindow.has(e.date)).map((e) => e.mood)
  const last7DaysAvgMood =
    recentMoods.length > 0 ? recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length : null

  return { streak, monthCount, last7DaysAvgMood }
}

export interface WeeklyReview {
  days: JournalEntry[]
  avgMood: number | null
  bestDay: JournalEntry | null
  worstDay: JournalEntry | null
  topEmotions: { emotion: Emotion; count: number }[]
  summary: string
  happyHighlights: string[]
  upsetHighlights: string[]
  gratefulHighlights: string[]
}

export interface MonthlyInsights {
  entries: JournalEntry[]
  avgMood: number | null
  bestDay: JournalEntry | null
  worstDay: JournalEntry | null
  topEmotions: { emotion: Emotion; count: number }[]
  summary: string
  dailyMoodSeries: { date: string; label: string; mood: number }[]
  emotionCounts: { emotion: Emotion; count: number }[]
  weeklyAverages: { weekLabel: string; avgMood: number }[]
  recurringThemes: { keyword: string; count: number }[]
  trend: 'up' | 'down' | 'flat' | 'unknown'
  trendDelta: number | null
}

const STOPWORDS = new Set([
  '今天', '的', '了', '一個', '一些', '有點', '有些', '感覺', '因為',
  '還是', '雖然', '但是', '而且', '對於', '自己', '很多', '一直',
  '就是', '也', '都', '在', '和', '跟', '是', '很', '不', '沒有',
  '真的', '一點', '這個', '那個', '一下', '覺得', '讓我', '讓自己',
])

/**
 * Very small keyword extractor for the AI-free v1: no segmentation
 * library, so instead of trusting raw n-gram frequency (which turns one
 * long sentence into a pile of overlapping, meaningless 3-4 char slices)
 * we only count a phrase once per *entry* it appears in, and only
 * surface phrases that recur across at least `minCount` distinct
 * entries. That matches the actual goal here ("what keeps coming up"),
 * and gracefully returns nothing when there isn't enough history yet
 * rather than showing noise. Can be replaced by an LLM call later
 * without changing any callers.
 */
export function extractKeywords(texts: string[], topN = 6, minCount = 2): { keyword: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const text of texts) {
    if (!text) continue
    const gramsInThisText = new Set<string>()

    const segments = text
      .split(/[，。、！？!?,.\n\r\t~～…・:：;；「」『』()（）\[\]"']+/)
      .map((s) => s.trim())
      .filter(Boolean)

    for (const segment of segments) {
      const chineseChunks = segment.match(/[一-鿿]+/g) ?? []
      for (const chunk of chineseChunks) {
        for (let len = 2; len <= 3 && len <= chunk.length; len++) {
          for (let i = 0; i + len <= chunk.length; i++) {
            const gram = chunk.slice(i, i + len)
            if (STOPWORDS.has(gram)) continue
            gramsInThisText.add(gram)
          }
        }
      }

      const wordChunks = segment.match(/[A-Za-z0-9]+/g) ?? []
      for (const word of wordChunks) {
        if (word.length < 2) continue
        gramsInThisText.add(word.toLowerCase())
      }
    }

    for (const gram of gramsInThisText) {
      counts.set(gram, (counts.get(gram) ?? 0) + 1)
    }
  }

  // Prefer longer, more specific n-grams when they fully contain a
  // shorter one with the same count (avoids "開心的事" + "開心" both
  // showing up as separate near-duplicate entries).
  const entries = [...counts.entries()].filter(([, count]) => count >= minCount)
  const filtered = entries.filter(([gram, count]) => {
    return !entries.some(
      ([other, otherCount]) => other !== gram && other.includes(gram) && otherCount >= count,
    )
  })

  return filtered
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([keyword, count]) => ({ keyword, count }))
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function countEmotions(entries: JournalEntry[]): { emotion: Emotion; count: number }[] {
  const counts = new Map<Emotion, number>()
  for (const e of entries) {
    for (const emotion of e.emotions) {
      counts.set(emotion, (counts.get(emotion) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([emotion, count]) => ({ emotion, count }))
}

export function buildWeeklyReview(allEntries: JournalEntry[], endKey?: string): WeeklyReview {
  const window = new Set(lastNDays(7, endKey))
  const days = allEntries
    .filter((e) => window.has(e.date))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const moods = days.map((d) => d.mood)
  const avgMood = average(moods)

  let bestDay: JournalEntry | null = null
  let worstDay: JournalEntry | null = null
  for (const d of days) {
    if (!bestDay || d.mood > bestDay.mood) bestDay = d
    if (!worstDay || d.mood < worstDay.mood) worstDay = d
  }

  const topEmotions = countEmotions(days).slice(0, 3)

  const summary = buildPeriodSummary({
    count: days.length,
    avgMood,
    bestDay,
    worstDay,
    topEmotions,
    trend: null,
    periodLabel: '這週',
    emptyMessage: '這週還沒有紀錄，從今天開始寫下第一篇也不遲。',
  })

  const happyHighlights = days.filter((d) => d.happy.trim()).map((d) => d.happy.trim())
  const upsetHighlights = days.filter((d) => d.upset.trim()).map((d) => d.upset.trim())
  const gratefulHighlights = days.filter((d) => d.grateful.trim()).map((d) => d.grateful.trim())

  return {
    days,
    avgMood,
    bestDay,
    worstDay,
    topEmotions,
    summary,
    happyHighlights,
    upsetHighlights,
    gratefulHighlights,
  }
}

/** Shared by the weekly and monthly local (non-AI) "我" summary — both are
 * the same shape of sentence (mood level, top emotions, best/worst day,
 * optionally a trend), just over a different window and with different
 * wording for the period itself. */
function buildPeriodSummary(input: {
  count: number
  avgMood: number | null
  bestDay: JournalEntry | null
  worstDay: JournalEntry | null
  topEmotions: { emotion: Emotion; count: number }[]
  trend: 'up' | 'down' | 'flat' | 'unknown' | null
  periodLabel: string
  emptyMessage: string
}): string {
  const { count, avgMood, bestDay, worstDay, topEmotions, trend, periodLabel, emptyMessage } = input

  if (count === 0) return emptyMessage

  const parts: string[] = []

  if (avgMood !== null) {
    if (avgMood >= 7) {
      parts.push(`${periodLabel}心情偏好，平均 ${avgMood.toFixed(1)} 分。`)
    } else if (avgMood >= 4.5) {
      parts.push(`${periodLabel}心情算平穩，平均 ${avgMood.toFixed(1)} 分，有起有落。`)
    } else {
      parts.push(`${periodLabel}心情偏低，平均 ${avgMood.toFixed(1)} 分，辛苦了。`)
    }
  }

  if (topEmotions.length > 0) {
    parts.push(`最常出現的情緒是「${topEmotions.map((e) => e.emotion).join('、')}」。`)
  }

  if (bestDay && worstDay && bestDay.date !== worstDay.date) {
    parts.push(
      `${formatShort(bestDay.date)} 是狀態最好的一天，${formatShort(worstDay.date)} 相對辛苦一些。`,
    )
  }

  if (trend === 'up') parts.push('整體來說情緒正在變好 ↗。')
  else if (trend === 'down') parts.push('整體來說情緒有些下滑 ↘，多照顧自己。')
  else if (trend === 'flat') parts.push('整體來說情緒大致平穩 →。')

  parts.push(`${periodLabel}留下了 ${count} 篇紀錄，持續認識自己中。`)

  return parts.join(' ')
}

export function buildMonthlyInsights(allEntries: JournalEntry[], monthStart: Date): MonthlyInsights {
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()

  const entries = allEntries
    .filter((e) => {
      const d = parseDateKey(e.date)
      return d.getFullYear() === year && d.getMonth() === month
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const moods = entries.map((e) => e.mood)
  const avgMood = average(moods)

  let bestDay: JournalEntry | null = null
  let worstDay: JournalEntry | null = null
  for (const e of entries) {
    if (!bestDay || e.mood > bestDay.mood) bestDay = e
    if (!worstDay || e.mood < worstDay.mood) worstDay = e
  }

  const dailyMoodSeries = entries.map((e) => ({
    date: e.date,
    label: formatShort(e.date),
    mood: e.mood,
  }))

  const emotionCounts = countEmotions(entries)
  const topEmotions = emotionCounts.slice(0, 3)

  // Group into calendar weeks (Sun-Sat) within the month for the weekly
  // average trend.
  const weekBuckets = new Map<string, number[]>()
  for (const e of entries) {
    const d = parseDateKey(e.date)
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay())
    const key = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
    const bucket = weekBuckets.get(key) ?? []
    bucket.push(e.mood)
    weekBuckets.set(key, bucket)
  }
  const weeklyAverages = [...weekBuckets.entries()].map(([weekLabel, moods]) => ({
    weekLabel: `${weekLabel} 週`,
    avgMood: Number((average(moods) ?? 0).toFixed(2)),
  }))

  const recurringThemes = extractKeywords(entries.flatMap((e) => [e.happy, e.upset, e.proudOf, e.grateful]))

  let trend: MonthlyInsights['trend'] = 'unknown'
  let trendDelta: number | null = null
  if (entries.length >= 6) {
    const half = Math.floor(entries.length / 2)
    const firstHalfAvg = average(entries.slice(0, half).map((e) => e.mood))
    const secondHalfAvg = average(entries.slice(entries.length - half).map((e) => e.mood))
    if (firstHalfAvg !== null && secondHalfAvg !== null) {
      trendDelta = Number((secondHalfAvg - firstHalfAvg).toFixed(2))
      if (trendDelta > 0.4) trend = 'up'
      else if (trendDelta < -0.4) trend = 'down'
      else trend = 'flat'
    }
  }

  const summary = buildPeriodSummary({
    count: entries.length,
    avgMood,
    bestDay,
    worstDay,
    topEmotions,
    trend,
    periodLabel: '這個月',
    emptyMessage: '這個月還沒有紀錄，從今天開始寫下第一篇也不遲。',
  })

  return {
    entries,
    avgMood,
    bestDay,
    worstDay,
    topEmotions,
    summary,
    dailyMoodSeries,
    emotionCounts,
    weeklyAverages,
    recurringThemes,
    trend,
    trendDelta,
  }
}

export type ReflectionField = 'grateful' | 'proudOf'

export interface ReflectionItem {
  date: string
  text: string
}

export interface ReflectionMonthGroup {
  monthLabel: string
  items: ReflectionItem[]
}

/** All non-empty values of one free-text field, newest first, grouped by
 * calendar month — powers the gratitude list and self-affirmation record
 * (both are "collect everything the user wrote for field X" views). */
export function collectReflections(entries: JournalEntry[], field: ReflectionField): ReflectionMonthGroup[] {
  const items: ReflectionItem[] = entries
    .filter((e) => e[field].trim())
    .map((e) => ({ date: e.date, text: e[field].trim() }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  const groups = new Map<string, ReflectionItem[]>()
  for (const item of items) {
    const d = parseDateKey(item.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  }

  return [...groups.entries()].map(([key, groupItems]) => {
    const [year, month] = key.split('-').map(Number)
    return { monthLabel: `${year} 年 ${month + 1} 月`, items: groupItems }
  })
}

export interface TimeCapsuleEntry {
  entry: JournalEntry
  label: string
}

/** Surfaces a past "給自己的話" on its approximate anniversary — 1 year,
 * then 3 months, then 1 month back, in that order (further back is more
 * resonant, so it wins if multiple exist). Returns null rather than
 * guessing when nothing matches; this is a delight-on-occasion feature,
 * not something to force onto every visit. */
export function findTimeCapsuleEntry(entries: JournalEntry[], endKey: string = todayKey()): TimeCapsuleEntry | null {
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const candidates: { date: string; label: string }[] = [
    { date: subtractMonths(endKey, 12), label: '一年前的你，對自己說' },
    { date: subtractMonths(endKey, 3), label: '三個月前的你，對自己說' },
    { date: subtractMonths(endKey, 1), label: '一個月前的你，對自己說' },
  ]

  for (const { date, label } of candidates) {
    const entry = byDate.get(date)
    if (entry && entry.noteToSelf.trim()) {
      return { entry, label }
    }
  }
  return null
}
