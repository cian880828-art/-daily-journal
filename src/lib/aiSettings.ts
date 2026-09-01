/** Client-side "bring your own key" settings for the optional AI analysis
 * feature. The key never leaves the browser except in direct requests the
 * browser itself makes to Anthropic's API — there is no backend to proxy
 * or log it. See src/lib/aiClient.ts for how it's used. */

const API_KEY_STORAGE_KEY = 'daily-journal:ai:api-key'
const MODEL_STORAGE_KEY = 'daily-journal:ai:model'

export const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', hint: '分析品質最佳，費用也最高' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', hint: '品質與費用平衡' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', hint: '最省費用，適合輕量分析' },
] as const

export type AiModelId = (typeof AI_MODELS)[number]['id']

const DEFAULT_MODEL: AiModelId = 'claude-opus-5'

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

export function getModel(): AiModelId {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY)
    if (stored && AI_MODELS.some((m) => m.id === stored)) return stored as AiModelId
  } catch {
    // fall through to default
  }
  return DEFAULT_MODEL
}

export function setModel(model: AiModelId): void {
  localStorage.setItem(MODEL_STORAGE_KEY, model)
}
