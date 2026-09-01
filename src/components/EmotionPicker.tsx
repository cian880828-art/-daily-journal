import { EMOTIONS, type Emotion } from '../types/journal'

const EMOTION_EMOJI: Record<Emotion, string> = {
  開心: '😊',
  平靜: '🍃',
  期待: '✨',
  焦慮: '😥',
  難過: '😢',
  生氣: '😤',
  疲憊: '😪',
  孤單: '🌙',
  滿足: '🌤️',
}

interface Props {
  value: Emotion[]
  onChange: (next: Emotion[]) => void
}

export function EmotionPicker({ value, onChange }: Props) {
  function toggle(emotion: Emotion) {
    if (value.includes(emotion)) {
      onChange(value.filter((e) => e !== emotion))
    } else {
      onChange([...value, emotion])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {EMOTIONS.map((emotion) => {
        const active = value.includes(emotion)
        return (
          <button
            key={emotion}
            type="button"
            onClick={() => toggle(emotion)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium
              border transition active:scale-[0.97]
              ${
                active
                  ? 'bg-sage-100 border-sage-300 text-sage-600'
                  : 'bg-white border-stone-200 text-stone-500'
              }`}
          >
            <span aria-hidden>{EMOTION_EMOJI[emotion]}</span>
            {emotion}
          </button>
        )
      })}
    </div>
  )
}
