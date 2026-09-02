export interface AiDailyInsight {
  coreEvents: string
  emotionBreakdown: string
  underlyingNeeds: string
  coreWound: string
  innerPattern: string
  realityVsInference: string
  reframe: string
  nextStep: string
}

export interface AiPromptInsight {
  reflection: string
  nextStep: string
}

export interface AiWeeklyInsight {
  emotionAnalysis: string
  stressors: string[]
  suggestions: string[]
  encouragement: string
}

export interface AiMonthlyInsight {
  emotionAnalysis: string
  happyPatterns: string
  anxietyPatterns: string
  trend: string
  suggestions: string[]
  encouragement: string
}

export interface CachedAiInsight<T> {
  fingerprint: string
  model: string
  generatedAt: string
  result: T
}
