import { cn } from '@/lib/cn'

export function SelectCheckbox({ checked, onToggle, label, className }: { checked: boolean; onToggle: (shift: boolean) => void; label: string; className?: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => {}}
      onClick={(e) => { e.stopPropagation(); onToggle(e.shiftKey) }}
      aria-label={label}
      className={cn('h-4 w-4 shrink-0 cursor-pointer accent-[var(--c-accent)]', className)}
    />
  )
}
