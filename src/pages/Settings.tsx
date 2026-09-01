import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { DEFAULT_MODEL, getApiKey, getModel, setApiKey, setModel } from '../lib/aiSettings'
import { testConnection } from '../lib/aiClient'

export function Settings() {
  const [apiKey, setApiKeyInput] = useState(getApiKey())
  const [model, setModelInput] = useState(getModel())
  const [saved, setSaved] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  function handleSave() {
    setApiKey(apiKey)
    setModel(model)
    setSaved(true)
    setTestState('idle')
    setTimeout(() => setSaved(false), 1800)
  }

  async function handleTest() {
    setApiKey(apiKey)
    setModel(model)
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

      <div className="card mb-6 space-y-4">
        <div>
          <label className="field-label" htmlFor="api-key">
            Gemini API Key
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AIza..."
            className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-[15px] text-ink
              focus:outline-none focus:ring-2 focus:ring-sage-300 focus:border-sage-300"
          />
          <p className="text-xs text-stone-400 mt-2 leading-relaxed">
            Key 只會存在這個瀏覽器的 localStorage，分析時會直接從瀏覽器呼叫 Google 的
            Gemini API，不會經過任何伺服器，也不需要付費。可以到{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-sage-600 underline"
            >
              aistudio.google.com/apikey
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
            placeholder={DEFAULT_MODEL}
            className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-[15px] text-ink
              focus:outline-none focus:ring-2 focus:ring-sage-300 focus:border-sage-300"
          />
          <p className="text-xs text-stone-400 mt-2 leading-relaxed">
            預設 {DEFAULT_MODEL}，屬於免費額度內的模型。如果 Google 之後調整了免費模型名稱，可以在這裡改成新的名稱，不需要更新 App。
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
          設定 API Key 後，「每週回顧」與「Insights」頁面會出現「AI
          分析」按鈕，會把該週／該月的紀錄內容送到 Google 的 Gemini API
          做情緒分析與建議，屬於選用功能、不會自動執行。不設定 Key 也完全不影響其他功能，仍會顯示免費的關鍵字式分析。這是你的個人紀錄，請自行評估是否要將內容送到第三方
          API 分析。
        </p>
      </div>
    </div>
  )
}
