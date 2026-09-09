import { getCurrentUserId, supabase, withTimeout } from './supabaseClient'
import { getApiKey, getModel, getUserContext, setApiKey, setModel, setUserContext } from './aiSettings'

interface AiSettingsRow {
  groq_api_key: string
  groq_model: string
  user_context: string
}

/** Pulls this account's saved AI settings (if any) down into this
 * device's localStorage — called once per login so opening the app on
 * a new device brings in a previously-entered API key automatically,
 * without needing to type it again. Only overwrites the key/model when
 * the cloud actually has one, so it can never blank out a key someone
 * just typed locally but hasn't saved yet. */
export async function syncAiSettingsFromCloud(): Promise<void> {
  const { data, error } = await withTimeout(supabase.from('ai_settings').select('*').maybeSingle())
  if (error) throw error
  if (!data) return

  const row = data as AiSettingsRow
  if (row.groq_api_key) setApiKey(row.groq_api_key)
  if (row.groq_model) setModel(row.groq_model)
  if (row.user_context) setUserContext(row.user_context)
}

/** Pushes this device's current AI settings up to the cloud — called
 * after Settings saves, so other devices on the same account pick them
 * up on their next login sync. */
export async function saveAiSettingsToCloud(): Promise<void> {
  const userId = await withTimeout(getCurrentUserId())
  if (!userId) return

  const { error } = await withTimeout(
    supabase.from('ai_settings').upsert(
      {
        user_id: userId,
        provider: 'groq',
        groq_api_key: getApiKey(),
        groq_model: getModel(),
        user_context: getUserContext(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    ),
  )
  if (error) throw error
}
