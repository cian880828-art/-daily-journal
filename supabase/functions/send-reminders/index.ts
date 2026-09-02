// Triggered on a schedule (every 30 minutes, via Supabase Cron — see
// README.md in this repo's supabase/ directory for setup) to check every
// subscribed device: if it's 20:30 or later in that user's local timezone
// and they haven't written today's journal entry yet, send a push
// reminder. Naturally stops firing after local midnight (the hour drops
// below 20) until 20:30 rolls around again the next day — no separate
// "already reminded" tracking needed, since the cron only ticks once per
// half hour anyway.
//
// Runs with the Supabase-injected service-role key (server-side only,
// never exposed to the browser) so it can read every user's subscriptions
// and entries regardless of RLS.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function localParts(timeZone: string, now: Date): { dateKey: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  }
}

// 20:30, then every half hour after — matches "8:30 提醒，9 點後每 30 分鐘再提醒一次"
// since 21:00/21:30/... are already every-30-min slots from 20:30 onward.
function isReminderSlot(hour: number, minute: number): boolean {
  if (minute !== 0 && minute !== 30) return false
  if (hour < 20) return false
  if (hour === 20 && minute < 30) return false
  return true
}

Deno.serve(async () => {
  const now = new Date()

  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth_key, timezone')

  if (subError) {
    console.error('failed to load push_subscriptions', subError)
    return new Response(JSON.stringify({ error: subError.message }), { status: 500 })
  }

  let sent = 0
  let skipped = 0
  let removed = 0

  for (const sub of subscriptions ?? []) {
    const { dateKey, hour, minute } = localParts(sub.timezone || 'Asia/Taipei', now)
    if (!isReminderSlot(hour, minute)) {
      skipped++
      continue
    }

    const { data: entry } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('user_id', sub.user_id)
      .eq('date', dateKey)
      .maybeSingle()
    if (entry) {
      skipped++
      continue
    }

    const isFirstReminder = hour === 20 && minute === 30
    const payload = JSON.stringify({
      title: isFirstReminder ? '該寫今天的日記了 🌙' : '還沒寫今天的日記喔',
      body: '花 2-5 分鐘，寫下今天的心情',
    })

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload,
      )
      sent++
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        // The push service says this subscription is gone (e.g. the user
        // uninstalled the app or cleared site data) — clean it up so
        // future runs don't keep trying it.
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        removed++
      } else {
        console.error('push send failed for subscription', sub.id, err)
      }
    }
  }

  return new Response(JSON.stringify({ sent, skipped, removed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
