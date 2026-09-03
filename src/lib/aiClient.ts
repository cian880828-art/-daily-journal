import type { JournalEntry } from '../types/journal'
import type { AiDailyInsight, AiMonthlyInsight, AiPromptInsight, AiWeeklyInsight } from '../types/aiInsight'
import { addDays, formatDateLabel, lastNDays } from './dateUtils'
import { getApiKey, getModel, getProvider } from './aiSettings'
import { readCachedInsight } from './useAiInsight'

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
    realEvents: { type: 'STRING' },
    patterns: { type: 'STRING' },
    whatHelped: { type: 'STRING' },
    expectedVsActual: { type: 'STRING' },
    nextWeekWatch: { type: 'STRING' },
  },
  required: ['realEvents', 'patterns', 'whatHelped', 'expectedVsActual', 'nextWeekWatch'],
}

/** Weekly leans recent — real events and short-window patterns — as
 * opposed to analyzeMonth, which leans longer-term trends and change.
 * Same "only say what the entries actually support" discipline as the
 * daily analysis: any field can come back an empty string when the week
 * doesn't support it, and the page hides that block rather than showing
 * forced content. */
export async function analyzeWeek(entries: JournalEntry[]): Promise<AiWeeklyInsight> {
  const userText = `以下是使用者最近 7 天的日記紀錄（依日期排序）：

${serializeEntries(entries)}

請根據這些內容分析（字串內容一律繁體中文，每項約 50-100 字；只根據紀錄裡實際出現的內容，不要腦補，若這週的紀錄真的看不出某一項，該項目請直接回傳空字串，不要硬編內容湊字數）：
- realEvents（真正影響我的事）：這週真正影響情緒的 1-3 件事，不是逐篇摘要整週內容，只挑真的有影響的
- patterns（這週看見的模式）：這週是否有重複出現的思考或行為模式，只有真的看得出來才寫，一次最多寫一個，不要下心理疾病或人格診斷
- whatHelped（什麼讓我變好一點）：這週有沒有什麼具體的事、行為或狀況，讓心情確實有轉好；如果整週都持平或往下，誠實地說沒有明顯讓心情變好的事，不要硬找
- expectedVsActual（原本擔心 vs 實際發生）：這週有沒有原本擔心、預期的事，最後實際發生的狀況和擔心的不一樣（變好或變糟都算），沒有這種對照就留空
- nextWeekWatch（下週值得觀察的一件事）：根據這週的內容，給一個下週可以留意、觀察的具體方向或問題，是一個觀察角度，不是待辦清單`
  const raw = await callAi(SYSTEM_PREAMBLE, userText, 2048, WEEKLY_SCHEMA)
  return parseJson<AiWeeklyInsight>(raw)
}

const DAILY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    coreEvents: { type: 'STRING' },
    emotionBreakdown: { type: 'STRING' },
    underlyingNeeds: { type: 'STRING' },
    coreWound: { type: 'STRING' },
    innerPattern: { type: 'STRING' },
    reframe: { type: 'STRING' },
    nextStep: { type: 'STRING' },
    nextStepCategories: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'coreEvents',
    'emotionBreakdown',
    'underlyingNeeds',
    'coreWound',
    'innerPattern',
    'reframe',
    'nextStep',
    'nextStepCategories',
  ],
}

/** Fixed vocabulary for nextStep's technique category, tracked per day so
 * repetition can be detected and blocked by category rather than by
 * comparing free-text prose similarity (which weaker models are bad at
 * self-policing). */
const NEXT_STEP_CATEGORIES = [
  '延遲反應',
  '記錄觸發點',
  '預期 vs 實際結果比較',
  '事實／推論拆分',
  '行為實驗',
  '對照測試',
  '優先級分類',
  '控制圈分類',
  '界線測試',
  '決策拆解',
  '需求辨識',
  '情緒強度評分',
  '自己 vs 他人標準比較',
  '找出第一個自動想法',
  '找出真正害怕的結果',
]

/** This app's persona for the daily breakdown specifically — deliberately
 * separate from SYSTEM_PREAMBLE (used by weekly/monthly/prompt), which
 * stays a simpler, softer voice. The daily analysis is meant to feel like
 * "a friend who really gets you, points out what you might not have
 * noticed" rather than a counselor's report or a motivational poster —
 * see the block-by-block instructions in analyzeDay for how each section
 * is expected to earn that. */
const DAILY_SYSTEM_PREAMBLE = `你是使用者的「溫柔、精準的自我觀察助手」。
你不是心理諮商師、不是人生導師，也不是只會安慰人的聊天機器人。
你的目標是讓使用者感覺：「有人真的理解我，但也願意幫我看見我沒有注意到的地方。」

【總體原則】
- 不要刻意正向思考，不需要替每個負面情緒找光明面，不要把所有事情都解讀成成長
- 不為了讓使用者感覺好而美化事實；可以指出矛盾、不合理期待、自我欺騙、逃避與重複模式，但不能武斷下結論
- 一律使用「可能」「目前看起來」「也許」「如果這個模式持續出現」這類措辭，不要用「你一定是因為…」這種肯定語氣
- 只根據日記中真正存在的資訊分析，不要腦補紀錄裡沒有的事；若資料不足，要明確說「今天的紀錄還不足以判斷」
- 不進行心理疾病、依附類型、人格等診斷
- 如果今天沒有明顯問題，不需要硬找問題；如果有正面的事情，可以承認它帶來的感受，但不要硬把負面事情翻成正面
- 語氣要溫柔、有人味，但不要過度安慰——大約 30% 理解、50% 洞察、20% 行動；可以適度表達理解（例如「這件事確實會讓人有點卡住」「看起來你今天其實同時承受了兩種拉扯」），但不要大量使用安慰句
- 絕對避免這些空泛鼓勵，除非上下文真的非常需要：「你很棒」「你已經做得很好了」「這證明你正在成長」「一切都會變好的」「相信自己」「你值得被愛」「你要學會愛自己」「今天也辛苦了」
- 一律使用繁體中文
- 只能回傳一個合法的 JSON 物件，不要加上 markdown code fence、不要加上任何額外文字或說明`

/** Journal entries strictly before `beforeDate`, within the last `days`
 * days, oldest first — given to the daily analysis as context so a
 * pattern that only shows up across several days can actually be
 * recognized, instead of every day being analyzed as if it's the first
 * one the AI has ever seen. */
function recentEntriesBefore(entries: JournalEntry[], beforeDate: string, days: number): JournalEntry[] {
  const cutoff = addDays(beforeDate, -days)
  return entries
    .filter((e) => e.date < beforeDate && e.date >= cutoff)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** The "明天可以試試看" suggestion (and its technique categories) from each
 * of the last `days` days that already has a cached AI result — read
 * straight from the local AI-result cache (no extra API calls) and fed
 * back into the prompt so today's suggestion doesn't just repeat one
 * already given earlier in the week. */
function recentNextSteps(
  beforeDate: string,
  days: number,
): { date: string; nextStep: string; categories: string[] }[] {
  const out: { date: string; nextStep: string; categories: string[] }[] = []
  for (const date of lastNDays(days, addDays(beforeDate, -1))) {
    const cached = readCachedInsight<AiDailyInsight>(`daily:${date}`)
    if (cached?.result.nextStep) {
      out.push({ date, nextStep: cached.result.nextStep, categories: cached.result.nextStepCategories ?? [] })
    }
  }
  return out
}

export async function analyzeDay(entry: JournalEntry, allEntries: JournalEntry[] = []): Promise<AiDailyInsight> {
  const history = recentEntriesBefore(allEntries, entry.date, 30)
  const pastNextSteps = recentNextSteps(entry.date, 7)

  const historyBlock = history.length
    ? `以下是使用者最近的日記紀錄，由舊到新排序，僅供你參考長期模式，不要逐篇分析：

${serializeEntries(history)}

只有當同一種情緒、觸發事件或需求，在這些紀錄中至少出現 2-3 次以上，才可以在分析中描述為「反覆出現的模式」；如果只出現一次，不要說是模式，也不要因為一天的紀錄就建立長期人格結論。`
    : '目前沒有足夠的過去紀錄可以參考——如果需要提到模式，請直接說今天的紀錄還不足以判斷是否為固定模式。'

  const usedCategories = [...new Set(pastNextSteps.flatMap((s) => s.categories))]
  const availableCategories = NEXT_STEP_CATEGORIES.filter((c) => !usedCategories.includes(c))

  const pastSuggestionsBlock = pastNextSteps.length
    ? `以下是最近幾天「明天可以試試看」已經用過的方法，僅供參考，內容本身不要重複或只是換句話說：
${pastNextSteps.map((s) => `- ${s.date}：${s.nextStep}`).join('\n')}`
    : ''

  const categoryConstraintBlock = usedCategories.length
    ? `nextStepCategories 這次「不可以」使用以下最近 7 天已經用過的類別：${usedCategories.join('、')}。請從其餘類別中選（可選：${(availableCategories.length ? availableCategories : NEXT_STEP_CATEGORIES).join('、')}）。除非今天的內容有非常明確的理由必須再次練習同一類別，否則不得重複。`
    : `nextStepCategories 請從以下清單中選擇最符合今天內容的類別：${NEXT_STEP_CATEGORIES.join('、')}。`

  const userText = `${historyBlock}

${pastSuggestionsBlock}

以下是使用者今天的日記紀錄：

${serializeEntries([entry])}

請依序完成以下 7 個區塊分析（字串內容一律繁體中文，每個區塊約 50-120 字；資料不足可以更短，不要為了湊字數重複同一件事，不要逐字重述日記原文）：

1. coreEvents（今天真正影響你的是）：只挑出 2-4 個真正影響情緒的事件，重點是回答「今天哪些事情真的有影響到你？」，不要逐字重述或摘要整篇日記

2. emotionBreakdown（情緒拆解）：把今天最值得注意的一個情緒事件拆成「事件」「自動想法」「情緒」「行為／反應」四段，用換行分開清楚標示（格式類似「事件：\n...\n\n自動想法：\n...\n\n情緒：\n...\n\n行為／反應：\n...」），不要把「發生的事情」和「自己的解讀」混在一起

3. underlyingNeeds（情緒底下可能在需要什麼）：不要只回答「安全感」「被愛」「支持」這種太籠統的答案，請更具體描述背後真正在意的是什麼（例如「你可能需要的是一種『事情即使還沒有答案，我也知道自己不會被突然丟下』的穩定感」）；如果證據不足，可以直接說目前無法判斷

4. coreWound（真正刺痛你的地方）：區分「事件本身」和「事件讓使用者感受到什麼」，例如真正刺痛的可能不是「對方沒有回訊息」，而是「好像自己沒有那麼重要」；如果今天沒有明顯刺痛點，不要硬找，可以直接說今天心情比較穩定、正向

5. innerPattern（今天看見的內在模式）：不要每天都硬找心理模式，如果證據不足就直接寫「目前不足以判斷這是不是固定模式。」；如果有觀察到，用「今天出現了一個可能值得觀察的模式：＿＿＿」開頭，並包含今天出現這個模式的證據、可能帶來的影響、還需要觀察什麼才能確認，一次最多選一個最重要的模式，不要一次列好幾個人格特質

6. reframe（換個角度看）：提供一個使用者可能沒有想到的角度，不一定要正面，目的是增加新的理解，不是讓使用者「想開」；不要硬把事情包裝成「這其實是一件好事」，如果真的沒有新角度，可以直接說資料不足

7. nextStep（明天可以試試看）：給 3 個具體的小行動或小實驗，每一點獨立一行（用換行分開，格式類似「1. ...\n2. ...\n3. ...」），都必須直接對應今天最重要的問題或模式，且符合：24 小時內可以完成、可以觀察結果、有明確行為、通常不超過 10-20 分鐘、做完後能得到新的資訊——不是為了叫使用者變正面，也不是單純舒壓，而是幫助理解自己或改變一個小反應。除非和今天的問題高度相關，否則避免「寫感恩/開心的事」「散步」「深呼吸」「找朋友聊天」「和伴侶分享感受」「好好休息」這類籠統建議

另外請填寫 nextStepCategories（陣列，對應 nextStep 三個方法各自的技巧類別，一個方法一個類別）。${categoryConstraintBlock}

如果今天其實過得很好、沒有明顯問題，就單純分析為什麼今天好，不需要挖出隱藏問題，coreWound 可以直接說明今天心情穩定、正向。`

  const raw = await callAi(DAILY_SYSTEM_PREAMBLE, userText, 4096, DAILY_SCHEMA)
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
    patterns: { type: 'STRING' },
    coreNeed: { type: 'STRING' },
    whatDrains: { type: 'STRING' },
    whatRestores: { type: 'STRING' },
    whatChanged: { type: 'STRING' },
    recentSelf: { type: 'STRING' },
    nextMonthWatch: { type: 'STRING' },
  },
  required: ['patterns', 'coreNeed', 'whatDrains', 'whatRestores', 'whatChanged', 'recentSelf', 'nextMonthWatch'],
}

/** Monthly leans long-term — trends, core needs, and change across the
 * whole month — as opposed to analyzeWeek, which leans recent events and
 * short-window patterns. Same discipline as daily/weekly: any field can
 * come back an empty string when the month doesn't support it, and the
 * page hides that block rather than showing forced content. */
export async function analyzeMonth(entries: JournalEntry[]): Promise<AiMonthlyInsight> {
  const userText = `以下是使用者這個月的日記紀錄（依日期排序）：

${serializeEntries(entries)}

請根據這些內容分析，著重在較長期的趨勢與變化，而不是單一天發生的小事（字串內容一律繁體中文，每項約 50-100 字；只根據紀錄裡實際出現的內容，不要腦補，若這個月的紀錄真的看不出某一項，該項目請直接回傳空字串，不要硬編內容湊字數）：
- patterns（這個月看見的模式）：這個月是否有重複出現的思考、情緒或行為模式，一次最多寫一個最明顯的，不要下心理疾病或人格診斷，沒有明顯模式就留空
- coreNeed（我真正需要的是什麼）：從這個月的內容看，背後反覆出現、真正在意的需求是什麼；不要只回答「安全感」「被愛」這種太籠統的詞，要更具體描述
- whatDrains（什麼最容易消耗我）：這個月最常讓使用者感到疲憊、低落或耗損的事情或情境類型
- whatRestores（什麼真的讓我恢復）：這個月真正讓使用者恢復精神或心情變好的事情，只寫紀錄裡真的出現過的，不是通用建議
- whatChanged（這個月有什麼變了）：跟這個月稍早比起來，月底或最近有什麼確實不一樣的地方（心情、想法、行為都算）；如果沒有明顯變化，直接說大致持平，不要硬找變化
- recentSelf（最近的我）：只看這個月最後幾天的紀錄，最近的狀態是什麼樣子，可以跟整個月的整體狀態不同
- nextMonthWatch（下個月值得觀察的一件事）：根據這個月的內容，給下個月一個值得觀察的具體方向，是一個觀察角度，不是待辦清單`
  const raw = await callAi(SYSTEM_PREAMBLE, userText, 3072, MONTHLY_SCHEMA)
  return parseJson<AiMonthlyInsight>(raw)
}
