import { useCallback, useEffect, useState } from 'react'
import type { CachedAiInsight } from '../types/aiInsight'
import { getModel, hasApiKey } from './aiSettings'

const PREFIX = 'daily-journal:ai-cache:'

function readCache<T>(key: string): CachedAiInsight<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as CachedAiInsight<T>) : null
  } catch {
    return null
  }
}

/** Reads a previously cached AI insight by its cache key (e.g.
 * `daily:2026-09-01`) without subscribing to it — used by aiClient to pull
 * recent days' cached results as context for the next analysis (so it can
 * avoid repeating the same suggestion, or recognize a pattern across
 * several days) without re-calling the AI for days that already ran. */
export function readCachedInsight<T>(key: string): CachedAiInsight<T> | null {
  return readCache<T>(key)
}

function writeCache<T>(key: string, value: CachedAiInsight<T>): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

/** Neither provider's non-streaming API gives a real progress signal —
 * this is a best-effort read on elapsed time, not a report of what's
 * actually happening server-side. Still better than a static "分析中"
 * that looks identical whether it's been 2 seconds or 20. */
function progressLabel(elapsedSeconds: number): string {
  if (elapsedSeconds < 2) return '連線到 AI 服務…'
  if (elapsedSeconds < 6) return 'AI 正在閱讀你的紀錄…'
  if (elapsedSeconds < 12) return '整理成分析結果…'
  return '快好了，再等一下…'
}

/** Runs an AI analysis on demand (never automatically, to avoid surprise
 * API usage) and caches the result in localStorage keyed by a fingerprint
 * of the source entries, so re-visiting a page doesn't re-call the API
 * unless the underlying data actually changed. */
export function useAiInsight<T>(cacheKey: string, fingerprint: string, run: () => Promise<T>) {
  const [cached, setCached] = useState<CachedAiInsight<T> | null>(() => readCache<T>(cacheKey))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // cacheKey can change without the component unmounting (switching the
  // date on the daily entry page, or the month on Insights) — re-read
  // that key's cache instead of carrying over the previous key's state.
  useEffect(() => {
    setCached(readCache<T>(cacheKey))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  const stale = cached !== null && cached.fingerprint !== fingerprint

  const analyze = useCallback(async () => {
    setLoading(true)
    setError(null)
    setElapsedSeconds(0)
    const startedAt = Date.now()
    const tick = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    try {
      const result = await run()
      const entry: CachedAiInsight<T> = {
        fingerprint,
        model: getModel(),
        generatedAt: new Date().toISOString(),
        result,
      }
      writeCache(cacheKey, entry)
      setCached(entry)
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失敗，請再試一次')
    } finally {
      clearInterval(tick)
      setLoading(false)
    }
  }, [cacheKey, fingerprint, run])

  return {
    cached,
    stale,
    loading,
    error,
    analyze,
    apiKeyConfigured: hasApiKey(),
    progressLabel: progressLabel(elapsedSeconds),
  }
}
