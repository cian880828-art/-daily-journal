import { createClient } from '@supabase/supabase-js'

/** The project URL and publishable (anon) key are safe to ship in client
 * code — they're not secrets, access to user data is enforced by Row
 * Level Security policies on each table, not by hiding this key. The
 * secret/service-role key is never used here and must never be committed
 * to this repo (it's public). */
const SUPABASE_URL = 'https://dolevmbukbpzbwdtmoan.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XZ_9thL1ODYnfdtKGBOcVA_LmZQgol5'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
