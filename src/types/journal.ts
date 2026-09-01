export const EMOTIONS = [
  '開心',
  '平靜',
  '期待',
  '焦慮',
  '難過',
  '生氣',
  '疲憊',
  '孤單',
  '滿足',
] as const

export type Emotion = (typeof EMOTIONS)[number]

/**
 * One day's journal entry. `date` is the primary key in the form
 * "YYYY-MM-DD" (local calendar date, not a timestamp) so there is at
 * most one entry per day.
 */
export interface JournalEntry {
  id: string
  date: string
  happy: string
  upset: string
  grateful: string
  proudOf: string
  noteToSelf: string
  mood: number
  emotions: Emotion[]
  createdAt: string
  updatedAt: string
}

export type JournalEntryDraft = Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>
