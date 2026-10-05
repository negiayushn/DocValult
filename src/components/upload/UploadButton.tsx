import { Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useUploadQueue } from '@/hooks/useUploadQueue'

export function UploadButton({ folderId, className }: { folderId?: string | null; className?: string }) {
  const { openPicker } = useUploadQueue()
  return (
    <Button onClick={() => openPicker(folderId)} className={className}>
      <Upload className="h-4 w-4" aria-hidden /> Upload
    </Button>
  )
}

/** Large touch target for phones; sits above the bottom navigation. */
export function UploadFab({ folderId }: { folderId?: string | null }) {
  const { openPicker } = useUploadQueue()
  return (
    <button
      onClick={() => openPicker(folderId)}
      aria-label="Upload documents"
      className="fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-lg hover:bg-accent-hover dark:text-navy-950 md:hidden"
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
    >
      <Plus className="h-7 w-7" aria-hidden />
    </button>
  )
}
