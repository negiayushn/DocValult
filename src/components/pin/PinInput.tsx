import { forwardRef, useId } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  label?: string
  error?: string | null
  disabled?: boolean
  autoFocus?: boolean
}

/** Six dots over one real (invisible) input, so phones show the numeric keypad and paste/autofill behave. */
export const PinInput = forwardRef<HTMLInputElement, Props>(function PinInput(
  { value, onChange, onComplete, label = '6-digit PIN', error, disabled, autoFocus },
  ref,
) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="relative">
        <div className="grid grid-cols-6 gap-2" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'grid h-12 place-items-center rounded-lg border bg-surface text-2xl leading-none',
                error ? 'border-danger' : i === value.length && !disabled ? 'border-accent ring-2 ring-accent/25' : 'border-line',
                disabled && 'opacity-60',
              )}
            >
              {value[i] ? '•' : ''}
            </div>
          ))}
        </div>
        <input
          ref={ref}
          id={id}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6)
            onChange(v)
            if (v.length === 6) onComplete?.(v)
          }}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 focus:outline-none"
        />
      </div>
      {error && <p id={`${id}-err`} role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
})
