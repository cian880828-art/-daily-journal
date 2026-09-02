import { useCallback, useEffect, useState } from 'react'
import type { JournalEntry, JournalEntryDraft } from '../types/journal'
import { supabaseJournalRepo as journalRepo } from './supabaseJournalRepository'

/**
 * Loads all entries from the repository and exposes a `refresh` +
 * `save` pair so pages stay in sync after writes without needing a
 * global store. Fine at this data size (localStorage, single user);
 * swap for a query-cache hook if/when the repo moves to Supabase.
 */
export function useJournalEntries() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const all = await journalRepo.list()
    setEntries(all)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const save = useCallback(
    async (draft: JournalEntryDraft) => {
      const saved = await journalRepo.upsert(draft)
      await refresh()
      return saved
    },
    [refresh],
  )

  return { entries, loading, refresh, save }
}
