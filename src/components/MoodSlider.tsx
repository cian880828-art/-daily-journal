interface Props {
  value: number
  onChange: (next: number) => void
}

const MOOD_FACE = ['😞', '😞', '😕', '😕', '😐', '😐', '🙂', '🙂', '😄', '😄']

export function MoodSlider({ value, onChange }: Props) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-3xl" aria-hidden>
          {MOOD_FACE[value - 1]}
        </span>
        <span className="text-2xl font-semibold text-stone-700">
          {value} <span className="text-sm font-normal text-stone-400">/ 10</span>
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sage-500 h-2"
      />
      <div className="flex justify-between text-xs text-stone-400 mt-1">
        <span>心情低落</span>
        <span>心情很好</span>
      </div>
    </div>
  )
}
