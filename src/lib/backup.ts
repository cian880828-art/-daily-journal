import type { JournalEntry } from '../types/journal'
import type { PromptAnswer } from './promptAnswers'

const ENTRIES_KEY = 'daily-journal:entries:v1'
const PROMPT_ANSWERS_KEY = 'daily-journal:prompt-answers:v1'

interface BackupFile {
  app: 'daily-journal'
  version: 1
  exportedAt: string
  entries: JournalEntry[]
  promptAnswers: PromptAnswer[]
}

function readEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readPromptAnswers(): PromptAnswer[] {
  try {
    const raw = localStorage.getItem(PROMPT_ANSWERS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Downloads a JSON file with everything the user actually wrote — journal
 * entries and daily-question answers. Deliberately excludes AI settings
 * (an API key shouldn't end up in a file that might get shared or synced
 * elsewhere) and the AI insight cache (just regenerable analysis results,
 * not worth the file size). */
export function exportBackup(): void {
  const backup: BackupFile = {
    app: 'daily-journal',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: readEntries(),
    promptAnswers: readPromptAnswers(),
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

/** For each date, whichever copy (already on this device, or from the
 * imported file) has the newer updatedAt wins — so importing an older
 * backup on top of newer local entries can't accidentally lose them, and
 * importing on a fresh device just restores everything. */
function mergeByDate<T extends { date: string; updatedAt: string }>(existing: T[], incoming: T[]): T[] {
  const byDate = new Map<string, T>()
  for (const item of existing) byDate.set(item.date, item)
  for (const item of incoming) {
    const current = byDate.get(item.date)
    if (!current || item.updatedAt > current.updatedAt) {
      byDate.set(item.date, item)
    }
  }
  return Array.from(byDate.values())
}

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

  const mergedEntries = mergeByDate(readEntries(), backup.entries)
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(mergedEntries))

  const mergedPromptAnswers = mergeByDate(readPromptAnswers(), promptAnswers)
  localStorage.setItem(PROMPT_ANSWERS_KEY, JSON.stringify(mergedPromptAnswers))

  return { entriesCount: backup.entries.length, promptAnswersCount: promptAnswers.length }
}
