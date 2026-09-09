/** Client-side "bring your own key" settings for the optional AI analysis
 * feature. Groq is the only supported provider — called directly from the
 * browser with the user's own key, there is no backend to proxy or log
 * it. See src/lib/aiClient.ts for how these are used. */

const API_KEY_STORAGE_KEY = 'daily-journal:ai:groq-api-key'
const MODEL_STORAGE_KEY = 'daily-journal:ai:groq-model'
const USER_CONTEXT_STORAGE_KEY = 'daily-journal:ai:user-context'

// Safe, widely-available free-tier default. Users can override this in
// Settings if Groq renames/retires the model — see the model input's
// helper text — without needing a code change.
export const DEFAULT_MODEL = 'openai/gpt-oss-20b'

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  if (trimmed) {
    localStorage.setItem(API_KEY_STORAGE_KEY, trimmed)
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY)
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

export function getModel(): string {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY)
    if (stored && stored.trim()) return stored.trim()
  } catch {
    // fall through to default
  }
  return DEFAULT_MODEL
}

export function setModel(model: string): void {
  const trimmed = model.trim()
  if (trimmed) {
    localStorage.setItem(MODEL_STORAGE_KEY, trimmed)
  } else {
    localStorage.removeItem(MODEL_STORAGE_KEY)
  }
}

/** Free-text personal context (age, occupation, relationships, anything
 * the user wants the AI to already know) — included in every analyze*
 * prompt so the model doesn't start from zero each time. */
export function getUserContext(): string {
  try {
    return localStorage.getItem(USER_CONTEXT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setUserContext(context: string): void {
  const trimmed = context.trim()
  if (trimmed) {
    localStorage.setItem(USER_CONTEXT_STORAGE_KEY, trimmed)
  } else {
    localStorage.removeItem(USER_CONTEXT_STORAGE_KEY)
  }
}
