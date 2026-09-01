import { parseDateKey } from './dateUtils'

export const DAILY_PROMPTS = [
  '今天什麼時候最像自己？',
  '最近有什麼事情一直消耗你？',
  '最近最期待的是什麼？',
  '你現在真正需要的是休息、陪伴，還是空間？',
  '最近有什麼事情其實比你想像中重要？',
  '今天有沒有哪一刻，你其實想說「不要」？',
  '如果不用顧慮任何人的期待，你現在最想做什麼？',
  '最近有什麼事，是你明明不喜歡，卻一直勉強自己接受？',
  '最近什麼事情最容易讓你感到安心？',
  '最近你最常忽略自己的哪一種感受？',
] as const

/** Deterministic pick from the date itself — same day always yields the
 * same question (no need to persist "which one was shown"), and a new
 * calendar date naturally yields a new pick. */
export function getDailyPrompt(dateKey: string): string {
  const d = parseDateKey(dateKey)
  // Days since epoch, not just a char-code hash of the string, so
  // consecutive days don't cluster on nearby indices.
  const daysSinceEpoch = Math.floor(d.getTime() / 86400000)
  const index = ((daysSinceEpoch % DAILY_PROMPTS.length) + DAILY_PROMPTS.length) % DAILY_PROMPTS.length
  return DAILY_PROMPTS[index]
}
