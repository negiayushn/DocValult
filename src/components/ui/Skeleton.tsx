import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('rounded-md bg-subtle', className)}
      style={{
        backgroundImage: 'linear-gradient(90deg, transparent, rgba(127,147,200,.18), transparent)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s linear infinite',
      }}
    />
  )
}
