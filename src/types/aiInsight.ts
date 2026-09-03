export interface AiDailyInsight {
  coreEvents: string
  emotionBreakdown: string
  underlyingNeeds: string
  coreWound: string
  innerPattern: string
  reframe: string
  nextStep: string
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
