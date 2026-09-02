import { createClient } from '@supabase/supabase-js'

/** The project URL and publishable (anon) key are safe to ship in client
 * code — they're not secrets, access to user data is enforced by Row
 * Level Security policies on each table, not by hiding this key. The
 * secret/service-role key is never used here and must never be committed
 * to this repo (it's public). */
const SUPABASE_URL = 'https://dolevmbukbpzbwdtmoan.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XZ_9thL1ODYnfdtKGBOcVA_LmZQgol5'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

/** Reads the current user id from the local session (no network round
 * trip) — unlike supabase.auth.getUser(), which re-validates the token
 * against Supabase's server on every call. That extra request is a
 * needless point of failure on a flaky connection: it can hang with no
 * feedback to the user, since the query it's gating never even starts. */
export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export class SupabaseTimeoutError extends Error {}

/** Wraps a Supabase call with a hard timeout so a stalled network
 * request surfaces a clear, retryable error instead of leaving the UI
 * stuck on a loading state forever. */
export function withTimeout<T>(promise: PromiseLike<T>, ms = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SupabaseTimeoutError('連線逾時，請確認網路連線後再試一次。')), ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
