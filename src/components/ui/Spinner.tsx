import { Loader2 } from 'lucide-react'

export function FullPageSpinner() {
  return (
    <div className="grid h-full place-items-center" role="status" aria-label="Loading">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
    </div>
  )
}
