import { getCurrentUserId, supabase, withTimeout } from './supabaseClient'
import type { PromptAnswer } from './promptAnswers'

interface DbRow {
  date: string
  question: string
  answer: string
  updated_at: string
}

function fromRow(row: DbRow): PromptAnswer {
  return { date: row.date, question: row.question, answer: row.answer, updatedAt: row.updated_at }
}

export async function getPromptAnswer(date: string): Promise<PromptAnswer | undefined> {
  const { data, error } = await withTimeout(
    supabase.from('prompt_answers').select('*').eq('date', date).maybeSingle(),
  )
  if (error) throw error
  return data ? fromRow(data) : undefined
}

export async function savePromptAnswer(date: string, question: string, answer: string): Promise<PromptAnswer> {
  const userId = await withTimeout(getCurrentUserId())
  if (!userId) throw new Error('尚未登入')

  const { data, error } = await withTimeout(
    supabase
      .from('prompt_answers')
      .upsert(
        { user_id: userId, date, question, answer, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' },
      )
      .select()
      .single(),
  )
  if (error) throw error
  return fromRow(data)
}
