import { supabase } from './supabase'

// 仕様 3.2: 画面では「ID + 6桁PIN」のみ。内部で email/password に変換する。
const EMAIL_DOMAIN = 'toko.local'

export function loginIdToEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@${EMAIL_DOMAIN}`
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

export async function signIn(loginId: string, pin: string) {
  return supabase.auth.signInWithPassword({
    email: loginIdToEmail(loginId),
    password: pin,
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}
