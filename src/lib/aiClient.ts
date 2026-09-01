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
    coreEvent: { type: 'STRING' },
    surfaceFeelings: { type: 'STRING' },
    underlyingNeeds: { type: 'STRING' },
    coreWound: { type: 'STRING' },
    innerPattern: { type: 'STRING' },
    reframe: { type: 'STRING' },
    explorationQuestion: { type: 'STRING' },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'coreEvent',
    'surfaceFeelings',
    'underlyingNeeds',
    'coreWound',
    'innerPattern',
    'reframe',
    'explorationQuestion',
    'suggestions',
  ],
}

export async function analyzeDay(entry: JournalEntry): Promise<AiDailyInsight> {
  const userText = `以下是使用者今天的日記紀錄：

${serializeEntries([entry])}

如果紀錄裡有寫「難過、不舒服或煩躁的事」，請把分析聚焦在那件事上；如果是空的，才根據今天整體紀錄分析。

語氣要求：溫柔但不要過度安慰，可以直白，不說教，不下診斷，不要用「你一定是因為…」這種肯定語氣的推斷，多用「可能」「看起來」「也許」。分析必須根據紀錄裡實際出現的內容，不要腦補紀錄裡沒有的事。

請依序拆解（字串內容一律繁體中文，每項 3-5 句話，具體、不要空泛，不要逐字重述日記原文）：
- coreEvent：簡短整理今天真正影響情緒的核心事件是什麼
- surfaceFeelings：指出今天最明顯的 1-3 個情緒（例如焦慮、委屈、安心、失落、滿足）
- underlyingNeeds：分析這些情緒背後可能在保護、渴望什麼樣的需求，可以參考這類對照但不必照抄、依實際情況調整：焦慮→想獲得確定感、委屈→希望被理解、生氣→界線被侵犯、孤單→渴望連結、嫉妒→害怕自己不夠重要
- coreWound：找出今天真正讓使用者難受的核心，不一定是事件表面本身——例如不是「對方沒有回訊息」，而可能是「沒有被放在心上的感覺」
- innerPattern：觀察今天是否透露出重複的思考或行為模式，例如：容易預想最壞結果、把安全感綁在別人的反應上、對自己要求過高、很難接受事情失去控制、習慣先照顧別人的感受、容易否定自己的需要——只描述可能的模式，絕對不要下心理疾病或人格診斷
- reframe：提供一個使用者可能沒有想到、但合理且具體的觀點，幫助重新理解這件事，不是單純的正能量喊話
- explorationQuestion：不要直接告訴使用者應該怎麼做，而是提出一個根據今天紀錄客製化、值得使用者自己回答的探索性問題，幫助他更理解自己（風格參考：「如果今天沒有人需要你證明自己，你真正想怎麼過這一天？」，但不要套用範例本身，要依今天的內容重新設計）
- suggestions：1-3 個具體、溫和、今天或明天就能嘗試的建議，針對今天的內容客製化，不要講空泛的大道理`
  const raw = await callAi(SYSTEM_PREAMBLE, userText, 4096, DAILY_SCHEMA)
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
