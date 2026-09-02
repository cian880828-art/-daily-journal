import type { JournalEntry, JournalEntryDraft } from '../types/journal'
import type { JournalRepository } from './journalRepository'
import { getCurrentUserId, supabase, withTimeout } from './supabaseClient'

interface DbRow {
  id: string
  date: string
  happy: string
  upset: string
  grateful: string
  proud_of: string
  note_to_self: string
  mood: number
  emotions: string[]
  created_at: string
  updated_at: string
}

function fromRow(row: DbRow): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    happy: row.happy,
    upset: row.upset,
    grateful: row.grateful,
    proudOf: row.proud_of,
    noteToSelf: row.note_to_self,
    mood: row.mood,
    emotions: row.emotions as JournalEntry['emotions'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Row Level Security scopes every query to the signed-in user (auth.uid())
 * automatically — no need to filter by user_id in the queries themselves,
 * only to set it on insert (the column defaults to auth.uid() too, but we
 * still send it explicitly so upsert's conflict target has a real value to
 * compare against). Every call is wrapped in withTimeout so a stalled
 * network request surfaces a clear error instead of hanging the UI. */
export class SupabaseJournalRepository implements JournalRepository {
  async list(): Promise<JournalEntry[]> {
    const { data, error } = await withTimeout(
      supabase.from('journal_entries').select('*').order('date', { ascending: false }),
    )
    if (error) throw error
    return (data ?? []).map(fromRow)
  }

  async getByDate(date: string): Promise<JournalEntry | undefined> {
    const { data, error } = await withTimeout(
      supabase.from('journal_entries').select('*').eq('date', date).maybeSingle(),
    )
    if (error) throw error
    return data ? fromRow(data) : undefined
  }

  async upsert(draft: JournalEntryDraft): Promise<JournalEntry> {
    const userId = await withTimeout(getCurrentUserId())
    if (!userId) throw new Error('尚未登入')

    const { data, error } = await withTimeout(
      supabase
        .from('journal_entries')
        .upsert(
          {
            user_id: userId,
            date: draft.date,
            happy: draft.happy,
            upset: draft.upset,
            grateful: draft.grateful,
            proud_of: draft.proudOf,
            note_to_self: draft.noteToSelf,
            mood: draft.mood,
            emotions: draft.emotions,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,date' },
        )
        .select()
        .single(),
    )
    if (error) throw error
    return fromRow(data)
  }

  async remove(date: string): Promise<void> {
    const { error } = await withTimeout(supabase.from('journal_entries').delete().eq('date', date))
    if (error) throw error
  }
}

export const supabaseJournalRepo: JournalRepository = new SupabaseJournalRepository()
