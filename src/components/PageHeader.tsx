import { useNavigate } from 'react-router-dom'

interface Props {
  title: string
  subtitle?: string
  back?: boolean
}

export function PageHeader({ title, subtitle, back }: Props) {
  const navigate = useNavigate()
  return (
    <header className="flex items-start gap-3 mb-6">
      {back && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="返回"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full
            border border-stone-200 bg-white text-stone-500 active:scale-95 transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <div>
        <h1 className="text-xl font-semibold text-stone-800">{title}</h1>
        {subtitle && <p className="text-sm text-stone-500 mt-1">{subtitle}</p>}
      </div>
    </header>
  )
}
