import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDailyPrompt } from '../lib/dailyPrompts'
import { getPromptAnswer, savePromptAnswer } from '../lib/supabasePromptAnswers'
import type { PromptAnswer } from '../lib/promptAnswers'
import { todayKey } from '../lib/dateUtils'
import { analyzePrompt } from '../lib/aiClient'
import { useAiInsight } from '../lib/useAiInsight'
import type { AiPromptInsight } from '../types/aiInsight'
import { AutoGrowTextarea } from './AutoGrowTextarea'

/** One self-discovery question per day, picked deterministically from the
 * date (see getDailyPrompt) so it's stable within a day and changes on
 * its own the next day — no need to persist which question was shown. */
export function DailyPromptCard() {
  const date = todayKey()
  const question = getDailyPrompt(date)

  const [saved, setSaved] = useState<PromptAnswer | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPromptAnswer(date).then((answer) => {
      if (!cancelled) setSaved(answer)
    })
    setEditing(false)
    return () => {
      cancelled = true
    }
  }, [date])

  const fingerprint = saved ? `${saved.date}:${saved.updatedAt}` : ''
  const ai = useAiInsight<AiPromptInsight>(`prompt:${date}`, fingerprint, () =>
    analyzePrompt(question, saved?.answer ?? ''),
  )

  function startEditing() {
    setDraft(saved?.answer ?? '')
    setEditing(true)
  }

  async function handleSave() {
    if (!draft.trim()) return
    setSaving(true)
    const answer = await savePromptAnswer(date, question, draft.trim())
    setSaved(answer)
    setEditing(false)
    setSaving(false)
  }

  return (
    <div className="card mt-6">
      <p className="text-xs font-medium text-stone-500 mb-2">今天的小問題</p>
      <p className="text-base text-stone-800 leading-relaxed mb-4">{question}</p>

      {editing ? (
        <div className="space-y-3">
          <AutoGrowTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="想到什麼就寫什麼，不用想太多"
            rows={3}
            className="field-textarea"
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? '儲存中…' : '儲存'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
              取消
            </button>
          </div>
        </div>
      ) : saved ? (
        <div>
          <p className="text-sm text-stone-600 leading-relaxed mb-2">{saved.answer}</p>
          <button type="button" onClick={startEditing} className="text-xs text-stone-400 underline">
            編輯回答
          </button>
          <div className="mt-4">
            <AiPromptSection ai={ai} />
          </div>
        </div>
      ) : (
        <button type="button" onClick={startEditing} className="text-sm text-sage-600 font-medium">
          寫下來 →
        </button>
      )}
    </div>
  )
}

function AiPromptSection({ ai }: { ai: ReturnType<typeof useAiInsight<AiPromptInsight>> }) {
  const { cached, stale, loading, error, analyze, apiKeyConfigured, progressLabel } = ai

  if (!apiKeyConfigured) {
    return (
      <div className="rounded-2xl bg-stone-50/70 p-3">
        <p className="text-xs text-stone-500 mb-2">想要 AI 針對這個回答給點回應嗎？</p>
        <Link to="/settings" className="text-xs text-sage-600 underline">
          前往設定
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-clay-100/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-clay-500 font-medium">AI 的回應</p>
        {cached && (
          <button
            type="button"
            onClick={analyze}
            disabled={loading}
            className="text-xs text-stone-400 underline disabled:opacity-50"
          >
            {loading ? '分析中…' : '重新分析'}
          </button>
        )}
      </div>

      {!cached && !loading && (
        <button type="button" onClick={analyze} className="btn-secondary w-full !py-2 text-sm">
          開始 AI 分析
        </button>
      )}

      {loading && !cached && <p className="text-xs text-stone-400 py-1">{progressLabel}</p>}
      {error && <p className="text-xs text-clay-500 mt-1">{error}</p>}

      {cached && (
        <div className="space-y-2">
          {stale && <p className="text-[11px] text-stone-400">回答有更新，這是上次的分析結果</p>}
          <p className="text-sm text-stone-700 leading-relaxed">{cached.result.reflection}</p>
          <p className="text-sm text-clay-500 leading-relaxed">💡 {cached.result.nextStep}</p>
        </div>
      )}
    </div>
  )
}
