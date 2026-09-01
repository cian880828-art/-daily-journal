import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { useJournalEntries } from '../lib/useJournalEntries'
import type { Emotion } from '../types/journal'
import type { AiDailyInsight } from '../types/aiInsight'
import { todayKey } from '../lib/dateUtils'
import { analyzeDay, computeFingerprint } from '../lib/aiClient'
import { useAiInsight } from '../lib/useAiInsight'
import { PageHeader } from '../components/PageHeader'
import { MoodSlider } from '../components/MoodSlider'
import { EmotionPicker } from '../components/EmotionPicker'
import { AutoGrowTextarea } from '../components/AutoGrowTextarea'

interface Props {
  journal: ReturnType<typeof useJournalEntries>
}

const QUESTIONS = [
  { key: 'happy', label: '今天開心的事是什麼？', placeholder: '例如：和朋友吃了很喜歡的午餐' },
  { key: 'upset', label: '今天難過、不舒服或煩躁的事是什麼？', placeholder: '寫下來，不用急著解決它' },
  { key: 'grateful', label: '今天感謝什麼？', placeholder: '一件小事也可以' },
  { key: 'proudOf', label: '今天覺得自己做得不錯的是什麼？', placeholder: '給自己一點肯定' },
  { key: 'noteToSelf', label: '如果可以對今天的自己說一句話，會是什麼？', placeholder: '想說什麼都可以' },
] as const

export function DailyEntry({ journal }: Props) {
  const { date: dateParam } = useParams()
  const navigate = useNavigate()
  const { entries, save } = journal

  const [date, setDate] = useState(dateParam ?? todayKey())
  const [happy, setHappy] = useState('')
  const [upset, setUpset] = useState('')
  const [grateful, setGrateful] = useState('')
  const [proudOf, setProudOf] = useState('')
  const [noteToSelf, setNoteToSelf] = useState('')
  const [mood, setMood] = useState(6)
  const [emotions, setEmotions] = useState<Emotion[]>([])
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const existingEntry = entries.find((e) => e.date === date)
  const isEditingExisting = existingEntry !== undefined

  const aiFingerprint = existingEntry ? computeFingerprint([existingEntry]) : ''
  const ai = useAiInsight<AiDailyInsight>(`daily:${date}`, aiFingerprint, () => analyzeDay(existingEntry!))

  useEffect(() => {
    const targetDate = dateParam ?? todayKey()
    setDate(targetDate)
    const existing = entries.find((e) => e.date === targetDate)
    if (existing) {
      setHappy(existing.happy)
      setUpset(existing.upset)
      setGrateful(existing.grateful)
      setProudOf(existing.proudOf)
      setNoteToSelf(existing.noteToSelf)
      setMood(existing.mood)
      setEmotions(existing.emotions)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, entries.length])

  function handleDateChange(next: string) {
    setDate(next)
    const existing = entries.find((e) => e.date === next)
    if (existing) {
      setHappy(existing.happy)
      setUpset(existing.upset)
      setGrateful(existing.grateful)
      setProudOf(existing.proudOf)
      setNoteToSelf(existing.noteToSelf)
      setMood(existing.mood)
      setEmotions(existing.emotions)
    } else {
      setHappy('')
      setUpset('')
      setGrateful('')
      setProudOf('')
      setNoteToSelf('')
      setMood(6)
      setEmotions([])
    }
  }

  const values: Record<(typeof QUESTIONS)[number]['key'], string> = {
    happy,
    upset,
    grateful,
    proudOf,
    noteToSelf,
  }
  const setters: Record<(typeof QUESTIONS)[number]['key'], (v: string) => void> = {
    happy: setHappy,
    upset: setUpset,
    grateful: setGrateful,
    proudOf: setProudOf,
    noteToSelf: setNoteToSelf,
  }

  async function handleSave() {
    setSaving(true)
    await save({ date, happy, upset, grateful, proudOf, noteToSelf, mood, emotions })
    setSaving(false)
    setJustSaved(true)
    setTimeout(() => navigate('/'), 650)
  }

  return (
    <div>
      <PageHeader
        title={isEditingExisting ? '編輯紀錄' : '今天的紀錄'}
        subtitle="慢慢寫，這是給自己的時間"
        back
      />

      <div className="mb-6">
        <label className="field-label" htmlFor="entry-date">
          日期
        </label>
        <input
          id="entry-date"
          type="date"
          value={date}
          max={todayKey()}
          onChange={(e) => handleDateChange(e.target.value)}
          className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-[15px] text-ink
            focus:outline-none focus:ring-2 focus:ring-sage-300 focus:border-sage-300"
        />
      </div>

      <div className="space-y-6">
        {QUESTIONS.map((q) => (
          <div key={q.key}>
            <label className="field-label" htmlFor={q.key}>
              {q.label}
            </label>
            <AutoGrowTextarea
              id={q.key}
              value={values[q.key]}
              onChange={(e) => setters[q.key](e.target.value)}
              placeholder={q.placeholder}
              rows={2}
              className="field-textarea"
            />
          </div>
        ))}

        <div>
          <label className="field-label">今天整體心情評分</label>
          <div className="card">
            <MoodSlider value={mood} onChange={setMood} />
          </div>
        </div>

        <div>
          <label className="field-label">今天主要情緒（可複選）</label>
          <EmotionPicker value={emotions} onChange={setEmotions} />
        </div>
      </div>

      <div className="mt-10">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full py-3.5 text-base"
        >
          {justSaved ? '已儲存 ♡' : saving ? '儲存中…' : '儲存今天的紀錄'}
        </button>
      </div>

      {existingEntry && (
        <div className="mt-6">
          <AiSection ai={ai} />
        </div>
      )}
    </div>
  )
}

function AiSection({ ai }: { ai: ReturnType<typeof useAiInsight<AiDailyInsight>> }) {
  const { cached, stale, loading, error, analyze, apiKeyConfigured, progressLabel } = ai

  if (!apiKeyConfigured) {
    return (
      <div className="card bg-stone-50/70">
        <p className="text-sm text-stone-600 mb-2">想要 AI 針對今天寫幾句回應嗎？</p>
        <p className="text-xs text-stone-400 mb-3">
          免費申請一組 Gemini API Key 就能使用，資料只會從你的瀏覽器直接送到 Google。
        </p>
        <Link to="/settings" className="btn-secondary inline-flex">
          前往設定
        </Link>
      </div>
    )
  }

  return (
    <div className="card bg-clay-100/40 border-clay-200/60">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-clay-500 font-medium">AI 給今天的回應</p>
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
        <button type="button" onClick={analyze} className="btn-primary w-full">
          開始 AI 分析
        </button>
      )}

      {loading && !cached && <p className="text-sm text-stone-400 py-2">{progressLabel}</p>}

      {error && <p className="text-sm text-clay-500 mt-2">{error}</p>}

      {cached && (
        <div className="space-y-3">
          {stale && <p className="text-xs text-stone-400">內容有更新，這是上次的分析結果</p>}
          <p className="text-sm text-stone-700 leading-relaxed">{cached.result.reflection}</p>
          <p className="text-sm text-clay-500 leading-relaxed">💡 {cached.result.suggestion}</p>
        </div>
      )}
    </div>
  )
}
