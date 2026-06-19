import { createClient } from '@supabase/supabase-js'

// フロントに置いてよいのは URL と anon キーのみ（CLAUDE.md ALWAYS）。
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// 未設定（空文字含む）でもアプリが落ちないようダミー値で生成。
// ?? は空文字を弾けないため || を使う。ログイン操作時に未設定エラーを表示する。
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key-not-set',
)
