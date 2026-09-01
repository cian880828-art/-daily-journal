import type { JournalEntry } from '../types/journal'
import type { AiDailyInsight, AiMonthlyInsight, AiPromptInsight, AiWeeklyInsight } from '../types/aiInsight'
import { formatDateLabel } from './dateUtils'
import { getApiKey, getModel, getProvider } from './aiSettings'

/** Thin clients for the supported AI providers (Gemini, Groq), called
 * directly from the browser with the user's own key — no backend, so
 * whether a provider works at all depends on it allowing direct
 * cross-origin browser calls (CORS). Gemini's legacy REST endpoint is
 * used deliberately instead of the `@google/genai` SDK: the SDK's newer
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

/** Dispatches to whichever provider is currently configured in Settings.
 * responseSchema is Gemini-specific JSON-guided decoding — Groq's
 * OpenAI-compatible API has no equivalent, so for Groq we rely on its
 * `response_format: json_object` mode plus the schema already being
 * spelled out in each analyze* function's userText prompt. */
async function callAi(
  systemInstruction: string,
  userText: string,
  maxOutputTokens: number,
  responseSchema: object,
): Promise<string> {
  const provider = getProvider()
  if (provider === 'groq') {
    return callGroq(systemInstruction, userText, maxOutputTokens)
  }
  return callGemini(systemInstruction, userText, maxOutputTokens, responseSchema)
}

async function callGemini(
  systemInstruction: string,
  userText: string,
  maxOutputTokens: number,
  responseSchema: object,
): Promise<string> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) {
    throw new AiConfigError('尚未設定 Gemini API Key，請先到設定頁輸入。')
  }
  const model = getModel('gemini')

  // Without this, a hung request (bad network, silent rate-limit, etc.)
  // leaves the caller's loading state stuck forever with no way to
  // recover except reloading the page.
  const TIMEOUT_MS = 30_000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(endpointUrl(model, apiKey), {
      method: 'POST',
      signal: controller.signal,
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
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AiRequestError('連線逾時，請確認網路連線後再試一次。')
    }
    throw new AiRequestError('無法連線到 Gemini API，請檢查網路連線。')
  } finally {
    clearTimeout(timeoutId)
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

/** Groq's API is OpenAI-compatible (chat/completions), called the same
 * way — direct fetch, no SDK. Unlike Gemini's endpoint, Groq (like most
 * LLM providers) is built for server-side use; whether it allows direct
 * browser calls at all is unverified here and depends on Groq's own CORS
 * policy, which can only really be confirmed by trying it from a real
 * browser. A network failure below is worded to cover that possibility
 * rather than claiming a definite cause the browser doesn't expose. */
async function callGroq(systemInstruction: string, userText: string, maxOutputTokens: number): Promise<string> {
  const apiKey = getApiKey('groq')
  if (!apiKey) {
    throw new AiConfigError('尚未設定 Groq API Key，請先到設定頁輸入。')
  }
  const model = getModel('groq')

  const TIMEOUT_MS = 30_000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: maxOutputTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userText },
        ],
      }),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AiRequestError('連線逾時，請確認網路連線後再試一次。')
    }
    throw new AiRequestError(
      '無法連線到 Groq API。這可能是網路問題，也可能是 Groq 不允許瀏覽器直接呼叫（CORS）——如果一直發生，建議改回 Gemini。',
    )
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    let message = `Groq API 回應錯誤（HTTP ${response.status}）`
    try {
      const errBody = await response.json()
      if (errBody?.error?.message) message = errBody.error.message
    } catch {
      // keep default message
    }
    if (response.status === 401 || response.status === 403) {
      throw new AiConfigError(`API Key 可能不正確或沒有權限：${message}`)
    }
    if (response.status === 429) {
      throw new AiRequestError('已達免費額度的速率限制，請稍後再試一次。')
    }
    throw new AiRequestError(message)
  }

  const data = await response.json()
  const finishReason = data?.choices?.[0]?.finish_reason
  const text: string = data?.choices?.[0]?.message?.content ?? ''

  if (!text.trim()) {
    if (finishReason === 'length') {
      throw new AiRequestError('這次分析的內容太長被截斷了，請再試一次。')
    }
    throw new AiRequestError('Groq 沒有回傳內容，請再試一次。')
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
  await callAi(
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
  const raw = await callAi(SYSTEM_PREAMBLE, userText, 2048, WEEKLY_SCHEMA)
  return parseJson<AiWeeklyInsight>(raw)
}

const DAILY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    whatHappened: { type: 'STRING' },
    feelings: { type: 'STRING' },
    needs: { type: 'STRING' },
    rootCause: { type: 'STRING' },
    reframe: { type: 'STRING' },
    nextStep: { type: 'STRING' },
  },
  required: ['whatHappened', 'feelings', 'needs', 'rootCause', 'reframe', 'nextStep'],
}

export async function analyzeDay(entry: JournalEntry): Promise<AiDailyInsight> {
  const userText = `以下是使用者今天的日記紀錄：

${serializeEntries([entry])}

如果紀錄裡有寫「難過、不舒服或煩躁的事」，請把下面每一項都聚焦在那件事上分析；如果那項是空的，才根據今天整體紀錄分析。用像貼心朋友的語氣（不要說教，字串內容一律繁體中文，每項 3-5 句話，寫得深入、具體，不要只是簡短帶過或講空泛的大道理，盡量具體引用紀錄中的內容），依序拆解：
- whatHappened：仔細描述那件難過/不舒服的事（或沒有的話，今天整體發生的事），只根據紀錄內容，不要腦補，但可以合理推測情境細節
- feelings：深入描述使用者面對這件事當下的情緒感受，包含可能同時存在的多種情緒，不只是重複心情分數
- needs：心情不好或不舒服時，通常代表有什麼願望、需求沒有被好好接住，盡量具體說明是哪一種需求
- rootCause：這個難過/不舒服背後比較真正的原因是什麼，感受已經到了，原因可能還沒說出口，可以連結到可能的深層信念或過去經驗
- reframe：針對這件讓使用者難過的事，換個角度看，溫和地重新框定，不用勉強樂觀，可以提供不只一種角度
- nextStep：針對這件事，1-2 個具體、溫和、今天或明天就能做的小行動，並簡單說明為什麼這麼做會有幫助`
  const raw = await callAi(SYSTEM_PREAMBLE, userText, 3072, DAILY_SCHEMA)
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
  const raw = await callAi(SYSTEM_PREAMBLE, userText, 1024, PROMPT_INSIGHT_SCHEMA)
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
  const raw = await callAi(SYSTEM_PREAMBLE, userText, 3072, MONTHLY_SCHEMA)
  return parseJson<AiMonthlyInsight>(raw)
}
