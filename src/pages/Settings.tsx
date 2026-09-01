import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import {
  DEFAULT_MODELS,
  type AiProvider,
  getApiKey,
  getModel,
  getProvider,
  setApiKey,
  setModel,
  setProvider,
} from '../lib/aiSettings'
import { testConnection } from '../lib/aiClient'

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'groq', label: 'Groq' },
]

export function Settings() {
  const [provider, setProviderInput] = useState<AiProvider>(getProvider())
  const [apiKey, setApiKeyInput] = useState(getApiKey(provider))
  const [model, setModelInput] = useState(getModel(provider))
  const [saved, setSaved] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  function handleProviderChange(next: AiProvider) {
    setProviderInput(next)
    setApiKeyInput(getApiKey(next))
    setModelInput(getModel(next))
    setTestState('idle')
  }

  function handleSave() {
    setProvider(provider)
    setApiKey(apiKey, provider)
    setModel(model, provider)
    setSaved(true)
    setTestState('idle')
    setTimeout(() => setSaved(false), 1800)
  }

  async function handleTest() {
    setProvider(provider)
    setApiKey(apiKey, provider)
    setModel(model, provider)
    setTestState('testing')
    setTestMessage('')
    try {
      await testConnection()
      setTestState('ok')
    } catch (err) {
      setTestState('error')
      setTestMessage(err instanceof Error ? err.message : '連線失敗')
    }
  }

  return (
    <div>
      <PageHeader title="設定" subtitle="AI 分析功能（選用、免費）" back />

      <div className="mb-6">
        <label className="field-label">AI 服務</label>
        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProviderChange(p.id)}
              className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                provider === p.id
                  ? 'border-sage-300 bg-sage-50 text-sage-700'
                  : 'border-stone-200 bg-white/80 text-stone-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {provider === 'groq' && (
          <p className="text-xs text-stone-400 mt-2 leading-relaxed">
            Groq 是否能從瀏覽器直接呼叫還沒有把握（多數 API 服務是設計給伺服器用的），先儲存並按「測試連線」在你的裝置上實際確認看看；不行的話切回
            Gemini 就好，不影響已經存的紀錄。
          </p>
        )}
      </div>

      <div className="card mb-6 space-y-4">
        <div>
          <label className="field-label" htmlFor="api-key">
            {provider === 'groq' ? 'Groq API Key' : 'Gemini API Key'}
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={provider === 'groq' ? 'gsk_...' : 'AIza...'}
            className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-[15px] text-ink
              focus:outline-none focus:ring-2 focus:ring-sage-300 focus:border-sage-300"
          />
          <p className="text-xs text-stone-400 mt-2 leading-relaxed">
            Key 只會存在這個瀏覽器的 localStorage，分析時會直接從瀏覽器呼叫{' '}
            {provider === 'groq' ? 'Groq' : 'Google 的 Gemini'} API，不會經過任何伺服器，也不需要付費。可以到{' '}
            <a
              href={provider === 'groq' ? 'https://console.groq.com/keys' : 'https://aistudio.google.com/apikey'}
              target="_blank"
              rel="noreferrer"
              className="text-sage-600 underline"
            >
              {provider === 'groq' ? 'console.groq.com/keys' : 'aistudio.google.com/apikey'}
            </a>{' '}
            免費申請（不需要信用卡）。免費額度有速率限制，一般個人使用足夠。
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="model">
            模型名稱
          </label>
          <input
            id="model"
            type="text"
            value={model}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder={DEFAULT_MODELS[provider]}
            className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-[15px] text-ink
              focus:outline-none focus:ring-2 focus:ring-sage-300 focus:border-sage-300"
          />
          <p className="text-xs text-stone-400 mt-2 leading-relaxed">
            預設 {DEFAULT_MODELS[provider]}，屬於免費額度內的模型。如果之後調整了免費模型名稱，可以在這裡改成新的名稱，不需要更新 App。
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <button type="button" onClick={handleSave} className="btn-primary flex-1">
          {saved ? '已儲存 ♡' : '儲存設定'}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={!apiKey.trim() || testState === 'testing'}
          className="btn-secondary"
        >
          {testState === 'testing' ? '測試中…' : '測試連線'}
        </button>
      </div>

      {testState === 'ok' && (
        <p className="text-sm text-sage-600 mb-6">連線成功，可以開始使用 AI 分析了 ♡</p>
      )}
      {testState === 'error' && <p className="text-sm text-clay-500 mb-6">{testMessage}</p>}

      <div className="card bg-stone-50/70">
        <p className="text-xs text-stone-500 leading-relaxed">
          設定 API Key 後，「每週回顧」、「Insights」、日記紀錄與每日小問題頁面會出現「AI
          分析」按鈕，會把對應的紀錄內容送到你選擇的 AI 服務做情緒分析與建議，屬於選用功能、不會自動執行。不設定 Key
          也完全不影響其他功能，仍會顯示免費的關鍵字式分析。這是你的個人紀錄，請自行評估是否要將內容送到第三方 API
          分析。切換 AI 服務不會刪除另一個服務已經存的 Key 和模型設定。
        </p>
      </div>
    </div>
  )
}
