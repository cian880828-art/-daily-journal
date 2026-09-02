import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  function signInWithGoogle() {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    })
  }

  /** Emails a one-time code — unlike Google's OAuth, this never leaves the
   * current page (no redirect to a browser and back), so it works reliably
   * inside an installed home-screen PWA on iOS, where a redirect round-trip
   * through Safari lands in a separate storage context and the session
   * never makes it back into the app. */
  function signInWithOtp(email: string) {
    return supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  }

  function verifyOtp(email: string, token: string) {
    return supabase.auth.verifyOtp({ email, token, type: 'email' })
  }

  function signOut() {
    return supabase.auth.signOut()
  }

  return { session, user: session?.user ?? null, loading, signInWithGoogle, signInWithOtp, verifyOtp, signOut }
}
