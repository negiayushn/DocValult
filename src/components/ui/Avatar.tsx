import { useState } from 'react'
import { cn } from '@/lib/cn'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** Round profile picture, falling back to initials when there is no image or it fails to load. */
export function Avatar({ url, name, className }: { url?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = !!url && failed !== url
  return (
    <span
      className={cn('grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft text-sm font-bold text-accent', className)}
      aria-hidden={showImage ? undefined : true}
    >
      {showImage ? (
        <img src={url!} alt={`${name}'s profile picture`} className="h-full w-full object-cover" onError={() => setFailed(url!)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}
