import { useEffect, useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { useUploadQueue } from '@/hooks/useUploadQueue'

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/** Drag files anywhere over the app to upload them to the library root. */
export function DropOverlay() {
  const { enqueue } = useUploadQueue()
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth.current += 1; setActive(true) } }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setActive(false)
      enqueue(Array.from(e.dataTransfer?.files ?? []))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [enqueue])

  if (!active) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-navy-950/70 p-6">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-white/60 px-10 py-12 text-white">
        <UploadCloud className="h-10 w-10" aria-hidden />
        <p className="text-lg font-semibold">Drop files to upload</p>
      </div>
    </div>
  )
}
