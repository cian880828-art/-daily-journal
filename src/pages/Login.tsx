import { useState } from 'react'

interface AuthResult {
  error: { message?: string } | null
}

interface Props {
  onSignInWithGoogle: () => void
  onSendCode: (email: string) => Promise<AuthResult>
  onVerifyCode: (email: string, code: string) => Promise<AuthResult>
}

export function Login({ onSignInWithGoogle, onSendCode, onVerifyCode }: Props) {
  const [step, setStep] = useState<'start' | 'code'>('start')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError('')
    const { error } = await onSendCode(email.trim())
    setSending(false)
    if (error) {
      setError(error.message || '傳送失敗，請確認 Email 是否正確。')
      return
    }
    setStep('code')
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setVerifying(true)
    setError('')
    const { error } = await onVerifyCode(email.trim(), code.trim())
    setVerifying(false)
    if (error) {
      setError(error.message || '驗證碼不正確，請再試一次。')
    }
    // success: the auth-state listener picks up the new session and the
    // parent re-renders past this page — nothing else to do here.
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-2xl font-semibold text-stone-800 mb-2">認識自己</p>
      <p className="text-sm text-stone-500 mb-10">Daily Journal</p>
      <p className="text-sm text-stone-500 mb-8 max-w-xs leading-relaxed">
        登入後，日記會存到雲端，換裝置也看得到，也才能設定準時提醒。
      </p>

      {step === 'start' && (
        <div className="w-full max-w-xs space-y-5">
          <button type="button" onClick={onSignInWithGoogle} className="btn-primary w-full">
            使用 Google 登入
          </button>

          <div className="flex items-center gap-3 text-xs text-stone-300">
            <span className="h-px flex-1 bg-stone-200" />
            或
            <span className="h-px flex-1 bg-stone-200" />
          </div>

          <form onSubmit={handleSendCode} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="你的 Email"
              className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-[15px] text-ink
                text-center focus:outline-none focus:ring-2 focus:ring-sage-300 focus:border-sage-300"
            />
            <button type="submit" disabled={sending || !email.trim()} className="btn-secondary w-full">
              {sending ? '傳送中…' : '傳送 Email 驗證碼登入'}
            </button>
          </form>

          <p className="text-xs text-stone-400 leading-relaxed">
            用主畫面圖示打開的話，建議用 Email 驗證碼登入——Google 登入在主畫面圖示裡有時會記不住登入狀態。
          </p>
        </div>
      )}

      {step === 'code' && (
        <form onSubmit={handleVerifyCode} className="w-full max-w-xs space-y-3">
          <p className="text-sm text-stone-500 leading-relaxed">
            驗證碼已寄到 {email}，請到信箱查看（也可以找找垃圾郵件夾）。
          </p>
          <input
            type="text"
            inputMode="numeric"
            required
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6 位數驗證碼"
            className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-[15px] text-ink
              text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-sage-300 focus:border-sage-300"
          />
          <button type="submit" disabled={verifying || !code.trim()} className="btn-primary w-full">
            {verifying ? '驗證中…' : '登入'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('start')
              setCode('')
              setError('')
            }}
            className="text-xs text-stone-400 underline"
          >
            換一個 Email
          </button>
        </form>
      )}

      {error && <p className="text-sm text-clay-500 mt-4 max-w-xs">{error}</p>}
    </div>
  )
}
