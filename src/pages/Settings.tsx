import { useRef, useState } from 'react'
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
import { exportBackup, importBackup } from '../lib/backup'
import { useAuth } from '../lib/useAuth'

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'groq', label: 'Groq' },
]

export function Settings() {
  const { user, signOut } = useAuth()
  const [provider, setProviderInput] = useState<AiProvider>(getProvider())
  const [apiKey, setApiKeyInput] = useState(getApiKey(provider))
  const [model, setModelInput] = useState(getModel(provider))
  const [saved, setSaved] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [importState, setImportState] = useState<'idle' | 'importing' | 'ok' | 'error'>('idle')
  const [importMessage, setImportMessage] = useState('')
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'error'>('idle')
  const [exportMessage, setExportMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExportState('exporting')
    setExportMessage('')
    try {
      await exportBackup()
      setExportState('idle')
    } catch (err) {
      setExportState('error')
      setExportMessage(err instanceof Error ? err.message : '匯出失敗，請再試一次。')
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportState('importing')
    try {
      const result = await importBackup(file)
      setImportState('ok')
      setImportMessage(`已還原 ${result.entriesCount} 篇日記、${result.promptAnswersCount} 則小問題回答，重新整理中…`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (err) {
      setImportState('error')
      setImportMessage(err instanceof Error ? err.message : '匯入失敗，請確認檔案是否正確。')
    }
  }

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

      <div className="card mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-stone-400 mb-0.5">已登入</p>
          <p className="text-sm text-stone-700">{user?.email}</p>
        </div>
        <button type="button" onClick={() => signOut()} className="btn-secondary">
          登出
        </button>
      </div>

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

      <div className="card bg-stone-50/70 mb-6">
        <p className="text-xs text-stone-500 leading-relaxed">
          設定 API Key 後，「每週回顧」、「Insights」、日記紀錄與每日小問題頁面會出現「AI
          分析」按鈕，會把對應的紀錄內容送到你選擇的 AI 服務做情緒分析與建議，屬於選用功能、不會自動執行。不設定 Key
          也完全不影響其他功能，仍會顯示免費的關鍵字式分析。這是你的個人紀錄，請自行評估是否要將內容送到第三方 API
          分析。切換 AI 服務不會刪除另一個服務已經存的 Key 和模型設定。
        </p>
      </div>

      <h2 className="text-sm font-medium text-stone-600 mb-3">資料備份</h2>
      <div className="card mb-6 space-y-4">
        <p className="text-xs text-stone-400 leading-relaxed">
          日記紀錄存在你登入帳號的雲端資料庫裡，換裝置只要登入同一個 Google 帳號就看得到。匯出備份會把目前帳號裡的所有內容存成一個檔案，可以自己留一份存到雲端硬碟或寄
          email 給自己；「匯入備份」會把檔案裡的內容寫回目前登入的帳號（依日期比對，同一天以匯入的內容覆蓋），適合救回誤刪的紀錄或把舊裝置留存的檔案補進帳號。
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={handleExport} disabled={exportState === 'exporting'} className="btn-secondary flex-1">
            {exportState === 'exporting' ? '匯出中…' : '匯出備份'}
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary flex-1">
            {importState === 'importing' ? '匯入中…' : '匯入備份'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
        {exportState === 'error' && <p className="text-sm text-clay-500">{exportMessage}</p>}
        {importState === 'ok' && <p className="text-sm text-sage-600">{importMessage}</p>}
        {importState === 'error' && <p className="text-sm text-clay-500">{importMessage}</p>}
      </div>
    </div>
  )
}
