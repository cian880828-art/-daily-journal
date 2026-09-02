import type { JournalEntry } from '../types/journal'
import type { PromptAnswer } from './promptAnswers'
import { supabase } from './supabaseClient'

interface BackupFile {
  app: 'daily-journal'
  version: 1
  exportedAt: string
  entries: JournalEntry[]
  promptAnswers: PromptAnswer[]
}

interface EntryRow {
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

interface PromptAnswerRow {
  date: string
  question: string
  answer: string
  updated_at: string
}

function entryFromRow(row: EntryRow): JournalEntry {
  return {
    id: row.date,
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

function promptAnswerFromRow(row: PromptAnswerRow): PromptAnswer {
  return { date: row.date, question: row.question, answer: row.answer, updatedAt: row.updated_at }
}

/** Downloads a JSON file with everything the user actually wrote — journal
 * entries and daily-question answers — read from their cloud account
 * (the actual source of truth). Deliberately excludes AI settings (an API
 * key shouldn't end up in a file that might get shared or synced
 * elsewhere) and the AI insight cache (just regenerable analysis
 * results, not worth the file size). */
export async function exportBackup(): Promise<void> {
  const [{ data: entryRows, error: entriesError }, { data: promptRows, error: promptError }] = await Promise.all([
    supabase.from('journal_entries').select('*'),
    supabase.from('prompt_answers').select('*'),
  ])
  if (entriesError) throw entriesError
  if (promptError) throw promptError

  const backup: BackupFile = {
    app: 'daily-journal',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: (entryRows ?? []).map(entryFromRow),
    promptAnswers: (promptRows ?? []).map(promptAnswerFromRow),
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const dateLabel = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `daily-journal-backup-${dateLabel}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export class BackupImportError extends Error {}

/** Uploads a backup file's contents into the signed-in user's cloud
 * account — upsert by date, so importing the same file twice (or an old
 * backup after writing more entries) never creates duplicates; the
 * imported copy simply overwrites the corresponding date on this
 * account. */
export async function importBackup(file: File): Promise<{ entriesCount: number; promptAnswersCount: number }> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupImportError('這不是有效的備份檔案（JSON 格式錯誤）。')
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as Record<string, unknown>).app !== 'daily-journal' ||
    !Array.isArray((parsed as Record<string, unknown>).entries)
  ) {
    throw new BackupImportError('這不是認識自己 Daily Journal 的備份檔案。')
  }
  const backup = parsed as BackupFile
  const promptAnswers = Array.isArray(backup.promptAnswers) ? backup.promptAnswers : []

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new BackupImportError('尚未登入，請先登入後再匯入備份。')

  if (backup.entries.length > 0) {
    const rows = backup.entries.map((e) => ({
      user_id: user.id,
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
    const { error } = await supabase.from('journal_entries').upsert(rows, { onConflict: 'user_id,date' })
    if (error) throw error
  }

  if (promptAnswers.length > 0) {
    const rows = promptAnswers.map((a) => ({
      user_id: user.id,
      date: a.date,
      question: a.question,
      answer: a.answer,
      updated_at: a.updatedAt,
    }))
    const { error } = await supabase.from('prompt_answers').upsert(rows, { onConflict: 'user_id,date' })
    if (error) throw error
  }

  return { entriesCount: backup.entries.length, promptAnswersCount: promptAnswers.length }
}
