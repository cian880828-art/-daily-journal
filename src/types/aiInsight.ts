export interface AiDailyInsight {
  coreEvents: string
  emotionBreakdown: string
  underlyingNeeds: string
  coreWound: string
  innerPattern: string
  reframe: string
  nextStep: string
  /** Which technique category each nextStep idea draws from (e.g.
   * "延遲反應", "記錄觸發點") — not shown in the UI, only fed back into
   * future days' prompts so nextStep stops repeating the same handful of
   * ideas in different words. */
  nextStepCategories: string[]
}

export interface AiPromptInsight {
  reflection: string
  nextStep: string
}

export interface AiWeeklyInsight {
  realEvents: string
  patterns: string
  whatHelped: string
  expectedVsActual: string
  nextWeekWatch: string
}

export interface AiMonthlyInsight {
  patterns: string
  coreNeed: string
  whatDrains: string
  whatRestores: string
  whatChanged: string
  recentSelf: string
  nextMonthWatch: string
}

export interface CachedAiInsight<T> {
  fingerprint: string
  model: string
  generatedAt: string
  result: T
}
