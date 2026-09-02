import { supabase, withTimeout } from './supabaseClient'
import type { JournalEntry } from '../types/journal'
import type { PromptAnswer } from './promptAnswers'

const ENTRIES_KEY = 'daily-journal:entries:v1'
const PROMPT_ANSWERS_KEY = 'daily-journal:prompt-answers:v1'
const MIGRATED_FLAG_KEY = 'daily-journal:migrated-to-cloud:v1'

function readLocalEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readLocalPromptAnswers(): PromptAnswer[] {
  try {
    const raw = localStorage.getItem(PROMPT_ANSWERS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** One-time upload of this device's pre-login localStorage journal into
 * the signed-in user's cloud data, so switching to accounts doesn't lose
 * what was already written. Guarded by a localStorage flag so it only
 * ever runs once per device — after that, the cloud copy is the source
 * of truth and local edits on other devices are expected to arrive via
 * their own one-time migration, not repeated overwrites from this one. */
export async function migrateLocalDataToCloud(userId: string): Promise<{ entries: number; promptAnswers: number }> {
  if (localStorage.getItem(MIGRATED_FLAG_KEY) === 'true') {
    return { entries: 0, promptAnswers: 0 }
  }

  const entries = readLocalEntries()
  const promptAnswers = readLocalPromptAnswers()

  if (entries.length > 0) {
    const rows = entries.map((e) => ({
      user_id: userId,
      date: e.date,
      happy: e.happy,
      upset: e.upset,
      grateful: e.grateful,
      proud_of: e.proudOf,
      note_to_self: e.noteToSelf,
      mood: e.mood,
      emotions: e.emotions,
      updated_at: e.updatedAt,
    }))
    const { error } = await withTimeout(supabase.from('journal_entries').upsert(rows, { onConflict: 'user_id,date' }))
    if (error) throw error
  }

  if (promptAnswers.length > 0) {
    const rows = promptAnswers.map((a) => ({
      user_id: userId,
      date: a.date,
      question: a.question,
      answer: a.answer,
      updated_at: a.updatedAt,
    }))
    const { error } = await withTimeout(supabase.from('prompt_answers').upsert(rows, { onConflict: 'user_id,date' }))
    if (error) throw error
  }

  localStorage.setItem(MIGRATED_FLAG_KEY, 'true')
  return { entries: entries.length, promptAnswers: promptAnswers.length }
}
