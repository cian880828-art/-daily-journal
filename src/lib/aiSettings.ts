/** Client-side "bring your own key" settings for the optional AI analysis
 * feature. Two providers are supported, both called directly from the
 * browser with the user's own key — there is no backend to proxy or log
 * it. Each provider keeps its own key/model so switching providers in
 * Settings doesn't lose the other one's. See src/lib/aiClient.ts for how
 * these are used. */

export type AiProvider = 'gemini' | 'groq'

const PROVIDER_STORAGE_KEY = 'daily-journal:ai:provider'

const API_KEY_STORAGE_KEYS: Record<AiProvider, string> = {
  gemini: 'daily-journal:ai:gemini-api-key',
  groq: 'daily-journal:ai:groq-api-key',
}

const MODEL_STORAGE_KEYS: Record<AiProvider, string> = {
  gemini: 'daily-journal:ai:gemini-model',
  groq: 'daily-journal:ai:groq-model',
}

// Safe, widely-available free-tier defaults. Users can override these in
// Settings if a provider renames/retires a model — see the model input's
// helper text — without needing a code change. (Gemini default was
// previously gemini-2.5-flash, retired for new callers as of 2026;
// Google's replacement is gemini-3.6-flash.)
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.6-flash',
  groq: 'openai/gpt-oss-20b',
}
export const DEFAULT_MODEL = DEFAULT_MODELS.gemini

export function getProvider(): AiProvider {
  try {
    const stored = localStorage.getItem(PROVIDER_STORAGE_KEY)
    if (stored === 'groq') return 'groq'
  } catch {
    // fall through to default
  }
  return 'gemini'
}

export function setProvider(provider: AiProvider): void {
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider)
}

export function getApiKey(provider: AiProvider = getProvider()): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEYS[provider]) ?? ''
  } catch {
    return ''
  }
}

export function setApiKey(key: string, provider: AiProvider = getProvider()): void {
  const trimmed = key.trim()
  if (trimmed) {
    localStorage.setItem(API_KEY_STORAGE_KEYS[provider], trimmed)
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEYS[provider])
  }
}

export function hasApiKey(provider: AiProvider = getProvider()): boolean {
  return getApiKey(provider).length > 0
}

export function getModel(provider: AiProvider = getProvider()): string {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE_KEYS[provider])
    if (stored && stored.trim()) return stored.trim()
  } catch {
    // fall through to default
  }
  return DEFAULT_MODELS[provider]
}

export function setModel(model: string, provider: AiProvider = getProvider()): void {
  const trimmed = model.trim()
  if (trimmed) {
    localStorage.setItem(MODEL_STORAGE_KEYS[provider], trimmed)
  } else {
    localStorage.removeItem(MODEL_STORAGE_KEYS[provider])
  }
}
