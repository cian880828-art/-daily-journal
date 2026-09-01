/** Local-calendar-date helpers. We deliberately avoid using UTC ISO strings
 * for "which day is this" logic, since that shifts dates across midnight
 * for users west of UTC. */

export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, delta: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + delta)
  return toDateKey(d)
}

export function isSameMonth(key: string, year: number, month: number): boolean {
  const d = parseDateKey(key)
  return d.getFullYear() === year && d.getMonth() === month
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export function formatDateLabel(key: string): string {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1}月${d.getDate()}日 週${WEEKDAY_LABELS[d.getDay()]}`
}

export function formatShort(key: string): string {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** Last N date keys ending today (inclusive), oldest first. */
export function lastNDays(n: number, endKey: string = todayKey()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(addDays(endKey, -i))
  }
  return out
}

/** Consecutive-day streak ending today, given a set of recorded date keys. */
export function computeStreak(dateKeys: Set<string>, endKey: string = todayKey()): number {
  let streak = 0
  let cursor = endKey
  while (dateKeys.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}
