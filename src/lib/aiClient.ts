import type { JournalEntry } from '../types/journal'
import type { AiDailyInsight, AiMonthlyInsight, AiPromptInsight, AiWeeklyInsight } from '../types/aiInsight'
import { formatDateLabel } from './dateUtils'
import { getApiKey, getModel } from './aiSettings'

/** Thin client for Google's Gemini API (free tier), called directly from
 * the browser with the user's own key — no backend. Plain `fetch` against
 * the plain `models/{model}:generateContent` REST endpoint is used
 * deliberately instead of the `@google/genai` SDK: the SDK's newer
 * "Interactions API" path sets an `Api-Revision` header that Gemini's
 * CORS config doesn't allow, which breaks entirely in the browser. The
 * legacy `generateContent` endpoint never sets that header and works
 * fine cross-origin with just `Content-Type: application/json` and the
 * key on the query string. */

export class AiConfigError extends Error {}
export class AiRequestError extends Error {}

function endpointUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
}

async function callGemini(
  systemInstruction: string,
  userText: string,
  maxOutputTokens: number,
  responseSchema: object,
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new AiConfigError('尚未設定 Gemini API Key，請先到設定頁輸入。')
  }
  const model = getModel()

  let response: Response
  try {
    response = await fetch(endpointUrl(model, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens,
          responseMimeType: 'application/json',
          // Constrains generation to this exact shape (JSON-guided
          // decoding), rather than trusting the model to follow a JSON
          // description we put in the prompt text — this is what
          // actually fixed the "AI 回覆格式異常" failures; describing
          // the shape in the prompt alone was not reliable enough.
          responseSchema,
          // Deliberately no thinkingConfig here: the field name/shape
          // for disabling thinking isn't consistent across Gemini model
          // generations (thinkingBudget vs thinkingLevel), and sending
          // one a given model doesn't recognize gets the whole request
          // rejected with a 400 "invalid argument" — worse than just
          // leaving thinking on. The thought-part filtering below plus
          // responseSchema are enough to get a reliably parseable answer
          // either way.
        },
      }),
    })
  } catch {
    throw new AiRequestError('無法連線到 Gemini API，請檢查網路連線。')
  }

  if (!response.ok) {
    let message = `Gemini API 回應錯誤（HTTP ${response.status}）`
    try {
      const errBody = await response.json()
      if (errBody?.error?.message) message = errBody.error.message
    } catch {
      // keep default message
    }
    if (response.status === 400 || response.status === 403) {
      throw new AiConfigError(`API Key 可能不正確或沒有權限：${message}`)
    }
    if (response.status === 429) {
      throw new AiRequestError('已達免費額度的速率限制，請稍後再試一次。')
    }
    throw new AiRequestError(message)
  }

  const data = await response.json()

  const finishReason = data?.candidates?.[0]?.finishReason
  if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
    throw new AiRequestError('這次的內容被安全機制擋下了，可以試著調整內容後再分析一次。')
  }

  // On thinking-capable models, the response can include "thought" parts
  // (reasoning) alongside the real answer part — those must be excluded,
  // or their prose gets concatenated into the JSON text and breaks
  // parsing.
  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')

  if (!text.trim()) {
    if (finishReason === 'MAX_TOKENS') {
      throw new AiRequestError('這次分析的內容太長被截斷了，請再試一次。')
    }
    throw new AiRequestError('Gemini 沒有回傳內容，請再試一次。')
  }
  return text
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T
      } catch {
        // fall through
      }
    }
    // Logged (not shown to the user) so a real failure can still be
    // diagnosed from the browser console instead of being a total
    // black box.
    console.error('[daily-journal] Gemini response failed to parse as JSON:', raw)
    throw new AiRequestError('AI 回覆格式異常，請再試一次。')
  }
}

const CONNECTION_TEST_SCHEMA = {
  type: 'OBJECT',
  properties: { ok: { type: 'BOOLEAN' } },
  required: ['ok'],
}

export async function testConnection(): Promise<void> {
  await callGemini(
    '你只需要用繁體中文回覆一個 JSON：{"ok": true}，不要加其他文字。',
    '請確認連線。',
    200,
    CONNECTION_TEST_SCHEMA,
  )
}

const SYSTEM_PREAMBLE = `你是一個溫柔、不帶批判的自我覺察助手，幫助使用者從日記內容中看見自己的情緒模式。
你不是心理治療師，不要給診斷或醫療建議；如果內容顯示強烈的自傷或危機徵兆，在建議中溫和地提醒尋求專業協助或信任的人陪伴。
一律使用繁體中文，語氣溫暖但不要過度誇張。
只能回傳一個合法的 JSON 物件，不要加上 markdown code fence、不要加上任何額外文字或說明。`

function serializeEntries(entries: JournalEntry[]): string {
  return entries
    .map((e) => {
      const lines = [
        `日期：${formatDateLabel(e.date)}`,
        `心情分數：${e.mood}/10`,
        `情緒標籤：${e.emotions.join('、') || '（無）'}`,
      ]
      if (e.happy.trim()) lines.push(`開心的事：${e.happy.trim()}`)
      if (e.upset.trim()) lines.push(`難過/煩躁的事：${e.upset.trim()}`)
      if (e.grateful.trim()) lines.push(`感謝的事：${e.grateful.trim()}`)
      if (e.proudOf.trim()) lines.push(`做得不錯的事：${e.proudOf.trim()}`)
      if (e.noteToSelf.trim()) lines.push(`給自己的話：${e.noteToSelf.trim()}`)
      return lines.join('\n')
    })
    .join('\n---\n')
}

const WEEKLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    emotionAnalysis: { type: 'STRING' },
    stressors: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
    encouragement: { type: 'STRING' },
  },
  required: ['emotionAnalysis', 'stressors', 'suggestions', 'encouragement'],
}

export async function analyzeWeek(entries: JournalEntry[]): Promise<AiWeeklyInsight> {
  const userText = `以下是使用者最近 7 天的日記紀錄（依日期排序）：

${serializeEntries(entries)}

請根據這些內容分析（字串內容一律繁體中文）：
- emotionAnalysis：2-3 句話，分析這週的情緒模式與變化
- stressors：1-3 個這週可能的壓力來源，盡量具體引用紀錄中的內容
- suggestions：2-4 個具體、可執行的建議，針對這週的情況客製化，不要講空泛的大道理
- encouragement：1 句給使用者的鼓勵的話`
  const raw = await callGemini(SYSTEM_PREAMBLE, userText, 2048, WEEKLY_SCHEMA)
  return parseJson<AiWeeklyInsight>(raw)
}

const DAILY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reflection: { type: 'STRING' },
    suggestion: { type: 'STRING' },
  },
  required: ['reflection', 'suggestion'],
}

export async function analyzeDay(entry: JournalEntry): Promise<AiDailyInsight> {
  const userText = `以下是使用者今天的日記紀錄：

${serializeEntries([entry])}

請根據這篇紀錄，用像貼心朋友的語氣（不要說教，字串內容一律繁體中文）分析：
- reflection：1-2 句話，回應今天的心情與內容，讓使用者感覺被理解
- suggestion：1 個具體、溫和、今天或明天就能做的小建議或提醒，針對今天的內容客製化`
  const raw = await callGemini(SYSTEM_PREAMBLE, userText, 1024, DAILY_SCHEMA)
  return parseJson<AiDailyInsight>(raw)
}

const PROMPT_INSIGHT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reflection: { type: 'STRING' },
    nextStep: { type: 'STRING' },
  },
  required: ['reflection', 'nextStep'],
}

export async function analyzePrompt(question: string, answer: string): Promise<AiPromptInsight> {
  const userText = `使用者今天回答了一個自我覺察問題：

問題：${question}
回答：${answer}

請根據這個回答，用像貼心朋友的語氣（不要說教，字串內容一律繁體中文）分析：
- reflection：1-2 句話，回應這個答案本身，讓使用者感覺被理解，不要重複問題
- nextStep：1 個具體、溫和、今天或明天就能做的小建議，針對這個答案客製化`
  const raw = await callGemini(SYSTEM_PREAMBLE, userText, 1024, PROMPT_INSIGHT_SCHEMA)
  return parseJson<AiPromptInsight>(raw)
}

/** Cheap fingerprint of a set of entries, used to detect when a cached AI
 * result is stale (an entry in range was added/edited since). */
export function computeFingerprint(entries: JournalEntry[]): string {
  return entries.map((e) => `${e.date}:${e.updatedAt}`).join('|')
}

const MONTHLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    emotionAnalysis: { type: 'STRING' },
    happyPatterns: { type: 'STRING' },
    anxietyPatterns: { type: 'STRING' },
    trend: { type: 'STRING' },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
    encouragement: { type: 'STRING' },
  },
  required: ['emotionAnalysis', 'happyPatterns', 'anxietyPatterns', 'trend', 'suggestions', 'encouragement'],
}

export async function analyzeMonth(entries: JournalEntry[]): Promise<AiMonthlyInsight> {
  const userText = `以下是使用者這個月的日記紀錄（依日期排序）：

${serializeEntries(entries)}

請根據這些內容分析（字串內容一律繁體中文）：
- emotionAnalysis：2-3 句話，分析這個月整體的情緒狀態
- happyPatterns：1-2 句話，這個月什麼樣的事最容易讓使用者開心
- anxietyPatterns：1-2 句話，這個月什麼樣的事最容易讓使用者焦慮或不舒服
- trend：1 句話，最近情緒是變好、變差還是持平，並簡短說明原因
- suggestions：2-4 個具體、可執行的建議，針對這個月的情況客製化
- encouragement：1 句給使用者的鼓勵的話`
  const raw = await callGemini(SYSTEM_PREAMBLE, userText, 3072, MONTHLY_SCHEMA)
  return parseJson<AiMonthlyInsight>(raw)
}
