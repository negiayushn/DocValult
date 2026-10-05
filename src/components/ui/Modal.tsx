import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  busy?: boolean
  children: ReactNode
}

/** Accessible modal on the native <dialog> element (focus trap, Esc, backdrop included). */
export function Modal({ open, title, onClose, busy, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose() }}
      onMouseDown={(e) => { if (e.target === ref.current && !busy) onClose() }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-navy-950/60"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} disabled={busy} aria-label="Close" className="-mr-2 -mt-1 grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-subtle">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
