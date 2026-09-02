import { getCurrentUserId, supabase, withTimeout } from './supabaseClient'

// Safe to commit — the VAPID public key is designed to be public (it's how
// the push service verifies notifications came from this app's private
// key, not a secret in itself). The private key never appears in this repo
// or any client-side code — it only lives as a Supabase Edge Function
// secret, used server-side when actually sending a push.
const VAPID_PUBLIC_KEY = 'BPbe9uv6cBemQIXLVo3Bc7GXchBmKngMfXZmrlvx37qcmoHMDSQc-NZs91QXlC8p6toa9lg0ugfymdtFGzHJqhg'

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** The browser's current push subscription for this app, if any — used to
 * reflect whether reminders are already on without re-requesting
 * permission. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/** Requests notification permission (if not already granted), subscribes
 * this browser to push, and saves the subscription to this account's row
 * in Supabase so the send-reminders Edge Function can find it later. */
export async function enableReminders(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('這個瀏覽器不支援推播通知。iPhone 需要先「加入主畫面」，用主畫面圖示打開才支援。')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('沒有取得通知權限，請到系統設定裡允許這個 App 的通知。')
  }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }

  const userId = await withTimeout(getCurrentUserId())
  if (!userId) throw new Error('請先登入帳號。')

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('訂閱通知失敗，請再試一次。')
  }

  const { error } = await withTimeout(
    supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei',
      },
      { onConflict: 'user_id,endpoint' },
    ),
  )
  if (error) throw error
}

/** Unsubscribes this browser from push and removes its row from Supabase,
 * so it stops receiving reminders. */
export async function disableReminders(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()

  const userId = await withTimeout(getCurrentUserId())
  if (!userId) return
  await withTimeout(
    supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint),
  )
}
