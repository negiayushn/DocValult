import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  separatorBefore?: boolean
}

/** Kebab menu rendered in a portal so table/card overflow never clips it. */
export function Menu({ items, label }: { items: MenuItem[]; label: string }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const open = pos !== null

  const toggle = () => {
    if (open) return setPos(null)
    const r = btn.current!.getBoundingClientRect()
    const right = window.innerWidth - r.right
    const estHeight = items.length * 40 + 16
    setPos(r.bottom + estHeight > window.innerHeight - 8 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right })
  }

  useEffect(() => {
    if (!open) return
    const close = () => setPos(null)
    const down = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) close()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btn.current?.focus() } }
    document.addEventListener('mousedown', down)
    document.addEventListener('touchstart', down)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    menu.current?.querySelector<HTMLElement>('button')?.focus()
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('touchstart', down)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        onClick={(e) => { e.stopPropagation(); toggle() }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div
          ref={menu}
          role="menu"
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="z-[55] min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          {items.map((it) => (
            <div key={it.label}>
              {it.separatorBefore && <div className="my-1 border-t border-line" />}
              <button
                role="menuitem"
                onClick={() => { setPos(null); it.onSelect() }}
                className={cn('flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-subtle', it.danger && 'text-danger')}
              >
                {it.icon && <it.icon className="h-4 w-4" aria-hidden />}
                {it.label}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
