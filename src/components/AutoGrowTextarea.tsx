import { useEffect, useRef, type TextareaHTMLAttributes } from 'react'

/** A textarea that grows with its content instead of clipping or relying
 * on a hidden internal scrollbar — fixed-row textareas were cutting off
 * longer entries with no visible way to see the rest. */
export function AutoGrowTextarea({ value, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return <textarea ref={ref} value={value} className={className} {...rest} />
}
