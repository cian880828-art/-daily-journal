import { useCallback, useState } from 'react'
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

function writeCache<T>(key: string, value: CachedAiInsight<T>): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

/** Runs an AI analysis on demand (never automatically, to avoid surprise
 * API usage) and caches the result in localStorage keyed by a fingerprint
 * of the source entries, so re-visiting a page doesn't re-call the API
 * unless the underlying data actually changed. */
export function useAiInsight<T>(cacheKey: string, fingerprint: string, run: () => Promise<T>) {
  const [cached, setCached] = useState<CachedAiInsight<T> | null>(() => readCache<T>(cacheKey))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stale = cached !== null && cached.fingerprint !== fingerprint

  const analyze = useCallback(async () => {
    setLoading(true)
    setError(null)
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
      setLoading(false)
    }
  }, [cacheKey, fingerprint, run])

  return { cached, stale, loading, error, analyze, apiKeyConfigured: hasApiKey() }
}
