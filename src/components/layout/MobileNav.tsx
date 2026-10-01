import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Star, Menu, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Logo } from '@/components/ui/Logo'
import { NavList } from './NavList'

const tabs = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/favorites', label: 'Favorites', icon: Star },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  return (
    <>
      <nav
        aria-label="Bottom"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn('flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium', isActive ? 'text-accent' : 'text-muted')
            }
          >
            <t.icon className="h-5 w-5" aria-hidden />
            {t.label}
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted">
          <Menu className="h-5 w-5" aria-hidden />
          Menu
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button aria-label="Close menu" className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-navy-950 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between pb-6">
              <Logo onDark className="px-2" />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md p-2 text-slate-300 hover:bg-navy-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
