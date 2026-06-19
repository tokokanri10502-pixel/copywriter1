import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { AppUser } from '../types'

// ログインセッションと public.users の役割を読み込むフック。
export function useSession() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AppUser | null>(null)

  useEffect(() => {
    let active = true

    async function loadUser(uid: string | undefined) {
      if (!uid) {
        if (active) {
          setUser(null)
          setLoading(false)
        }
        return
      }
      const { data } = await supabase
        .from('users')
        .select('id, login_id, display_name, role')
        .eq('id', uid)
        .maybeSingle()
      if (active) {
        setUser((data as AppUser | null) ?? null)
        setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => loadUser(data.session?.user?.id))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoading(true)
      loadUser(session?.user?.id)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return { loading, user }
}

export function homePathFor(user: AppUser): string {
  return user.role === 'manager' ? '/dashboard' : '/exam'
}
