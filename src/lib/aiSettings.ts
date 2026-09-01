/** Client-side "bring your own key" settings for the optional AI analysis
 * feature, backed by Google's Gemini API free tier. The key never leaves
 * the browser except in direct requests the browser itself makes to
 * Google — there is no backend to proxy or log it. See
 * src/lib/aiClient.ts for how it's used. */

const API_KEY_STORAGE_KEY = 'daily-journal:ai:gemini-api-key'
const MODEL_STORAGE_KEY = 'daily-journal:ai:gemini-model'

// A safe, widely-available free-tier default. Users can override this in
// Settings if Google renames/retires it — see the model input's helper
// text — without needing a code change.
export const DEFAULT_MODEL = 'gemini-2.5-flash'

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
