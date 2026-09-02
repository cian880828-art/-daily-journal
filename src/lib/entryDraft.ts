import type { Emotion } from '../types/journal'

const DRAFT_KEY_PREFIX = 'daily-journal:draft:v1:'

export interface EntryDraft {
  happy: string
  upset: string
  grateful: string
  proudOf: string
  noteToSelf: string
  mood: number
  emotions: Emotion[]
}

/** Drafts live only in this browser's localStorage — they're a safety net
 * against navigating away or reloading mid-edit, not a sync mechanism, so
 * they never touch the cloud. */
export function getDraft(date: string): EntryDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + date)
    if (!raw) return null
    return JSON.parse(raw) as EntryDraft
  } catch {
    return null
  }
}

export function saveDraft(date: string, draft: EntryDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY_PREFIX + date, JSON.stringify(draft))
  } catch {
    // localStorage full or unavailable — auto-save is a convenience, not critical
  }
}

export function clearDraft(date: string): void {
  try {
    localStorage.removeItem(DRAFT_KEY_PREFIX + date)
  } catch {
    // ignore
  }
}
