export interface PromptAnswer {
  date: string
  question: string
  answer: string
  updatedAt: string
}

const STORAGE_KEY = 'daily-journal:prompt-answers:v1'

function readAll(): PromptAnswer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(answers: PromptAnswer[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(answers))
}

export function getPromptAnswer(date: string): PromptAnswer | undefined {
  return readAll().find((a) => a.date === date)
}

export function savePromptAnswer(date: string, question: string, answer: string): PromptAnswer {
  const all = readAll()
  const now = new Date().toISOString()
  const existingIndex = all.findIndex((a) => a.date === date)
  const entry: PromptAnswer = { date, question, answer, updatedAt: now }

  if (existingIndex >= 0) {
    all[existingIndex] = entry
  } else {
    all.push(entry)
  }
  writeAll(all)
  return entry
}
