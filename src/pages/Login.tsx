import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isValidPin, signIn } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!loginId.trim()) {
      setError('IDを入力してください。')
      return
    }
    if (!isValidPin(pin)) {
      setError('PINは6桁の数字で入力してください。')
      return
    }
    if (!isSupabaseConfigured) {
      setError('接続先が未設定です（開発中）。Supabaseの設定後にログインできます。')
      return
    }

    setBusy(true)
    const { error } = await signIn(loginId, pin)
    setBusy(false)

    if (error) {
      setError('IDまたはPINが正しくありません。')
      return
    }
    // ログイン成功。役割に応じた画面へはルートガードが振り分ける。
    navigate('/')
  }

  return (
    <div className="page page--center login-bg">
      <form className="card login" onSubmit={handleSubmit}>
        <div className="login__brand">
          <span className="brand-mark">T</span>
          <span className="brand-kicker">TOKO COPYWRITER</span>
        </div>
        <h1 className="login__title">コピーライター<wbr />育成アプリ</h1>
        <p className="login__subtitle">ライティング基礎トレーニング</p>

        <label className="field">
          <span className="field__label">ID</span>
          <input
            className="field__input"
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoComplete="username"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="例: kuwahara"
          />
        </label>

        <label className="field">
          <span className="field__label">PIN（6桁）</span>
          <input
            className="field__input"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
          />
        </label>

        {error && <p className="login__error">{error}</p>}

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}
