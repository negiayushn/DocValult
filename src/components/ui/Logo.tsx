import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Logo({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white dark:text-navy-950">
        <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className={cn('text-base font-bold tracking-tight', onDark ? 'text-white' : 'text-fg')}>Personal Vault</span>
    </div>
  )
}
