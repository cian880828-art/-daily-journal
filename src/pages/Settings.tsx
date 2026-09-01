import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { AI_MODELS, getApiKey, getModel, setApiKey, setModel, type AiModelId } from '../lib/aiSettings'
import { testConnection } from '../lib/aiClient'

export function Settings() {
  const [apiKey, setApiKeyInput] = useState(getApiKey())
  const [model, setModelInput] = useState<AiModelId>(getModel())
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
      <PageHeader title="設定" subtitle="AI 分析功能" back />

      <div className="card mb-6 space-y-4">
        <div>
          <label className="field-label" htmlFor="api-key">
            Anthropic API Key
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-[15px] text-ink
              focus:outline-none focus:ring-2 focus:ring-sage-300 focus:border-sage-300"
          />
          <p className="text-xs text-stone-400 mt-2 leading-relaxed">
            Key 只會存在這個瀏覽器的 localStorage，分析時會直接從瀏覽器呼叫 Anthropic
            API，不會經過任何伺服器。可以到{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="text-sage-600 underline"
            >
              console.anthropic.com
            </a>{' '}
            申請。
          </p>
        </div>

        <div>
          <label className="field-label">分析使用的模型</label>
          <div className="space-y-2">
            {AI_MODELS.map((m) => (
              <label
                key={m.id}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition
                  ${model === m.id ? 'border-sage-300 bg-sage-50' : 'border-stone-200 bg-white/80'}`}
              >
                <span>
                  <span className="block text-sm font-medium text-stone-700">{m.label}</span>
                  <span className="block text-xs text-stone-400 mt-0.5">{m.hint}</span>
                </span>
                <input
                  type="radio"
                  name="ai-model"
                  checked={model === m.id}
                  onChange={() => setModelInput(m.id)}
                  className="accent-sage-500"
                />
              </label>
            ))}
          </div>
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
          分析」按鈕，會把該週／該月的紀錄內容送到 Anthropic 做情緒分析與建議，
          屬於選用功能、不會自動執行。這是你的個人紀錄，請自行評估是否要將內容送到第三方
          API 分析。
        </p>
      </div>
    </div>
  )
}
