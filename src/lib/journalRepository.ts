import type { JournalEntry, JournalEntryDraft } from '../types/journal'

/**
 * Storage-agnostic contract for reading/writing journal entries.
 * Swap `LocalStorageJournalRepository` for a Supabase-backed
 * implementation later without touching any page/component code —
 * everything in src/pages and src/components talks to this interface
 * (via the `journalRepo` singleton below), never to localStorage directly.
 */
export interface JournalRepository {
  list(): Promise<JournalEntry[]>
  getByDate(date: string): Promise<JournalEntry | undefined>
  upsert(draft: JournalEntryDraft): Promise<JournalEntry>
  remove(date: string): Promise<void>
}

const STORAGE_KEY = 'daily-journal:entries:v1'

function readAll(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(entries: JournalEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export class LocalStorageJournalRepository implements JournalRepository {
  async list(): Promise<JournalEntry[]> {
    return readAll().sort((a, b) => (a.date < b.date ? 1 : -1))
  }

  async getByDate(date: string): Promise<JournalEntry | undefined> {
    return readAll().find((e) => e.date === date)
  }

  async upsert(draft: JournalEntryDraft): Promise<JournalEntry> {
    const entries = readAll()
    const now = new Date().toISOString()
    const existingIndex = entries.findIndex((e) => e.date === draft.date)

    if (existingIndex >= 0) {
      const updated: JournalEntry = {
        ...entries[existingIndex],
        ...draft,
        updatedAt: now,
      }
      entries[existingIndex] = updated
      writeAll(entries)
      return updated
    }

    const created: JournalEntry = {
      ...draft,
      id: makeId(),
      createdAt: now,
      updatedAt: now,
    }
    entries.push(created)
    writeAll(entries)
    return created
  }

  async remove(date: string): Promise<void> {
    writeAll(readAll().filter((e) => e.date !== date))
  }
}

export const journalRepo: JournalRepository = new LocalStorageJournalRepository()
