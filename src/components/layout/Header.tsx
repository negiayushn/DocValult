import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Bell, LogOut, Search, Settings } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Logo } from '@/components/ui/Logo'
import { useToast } from '@/components/ui/Toast'
import { UploadButton } from '@/components/upload/UploadButton'
import { useAuth } from '@/hooks/useAuth'
import { useAvatarUrl, useProfile } from '@/hooks/useProfile'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { signOut } from '@/services/auth'
import { queryClient } from '@/lib/queryClient'
import { toMessage } from '@/lib/errors'

function Popover({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg"
      >
        {icon}
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-line bg-surface p-2 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function Header() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const { data: avatarUrl } = useAvatarUrl()
  const location = useLocation()
  const [params] = useSearchParams()
  const [q, setQ] = useState(() => (location.pathname === '/documents' ? params.get('q') ?? '' : ''))
  const debounced = useDebouncedValue(q, 300)
  const lastNavigated = useRef(debounced.trim())

  // Live search: results update ~300 ms after you stop typing.
  useEffect(() => {
    const term = debounced.trim()
    if (term === lastNavigated.current) return
    lastNavigated.current = term
    if (term) navigate(`/documents?q=${encodeURIComponent(term)}`, { replace: location.pathname === '/documents' })
    else if (location.pathname === '/documents') navigate('/documents', { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  // Clear the box when you leave the search results.
  useEffect(() => {
    if (location.pathname !== '/documents') { setQ(''); lastNavigated.current = '' }
  }, [location.pathname])

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    lastNavigated.current = term
    navigate(term ? `/documents?q=${encodeURIComponent(term)}` : '/documents')
  }

  const onSignOut = async () => {
    try {
      await signOut()
      queryClient.clear()
      navigate('/login', { replace: true })
    } catch (e) {
      toast.error(toMessage(e, 'Could not sign out. Try again.'))
    }
  }

  const name = profile?.display_name || user?.email?.split('@')[0] || 'Account'

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:px-6">
      <Link to="/" className="md:hidden" aria-label="Personal Vault home">
        <Logo className="[&>span:last-child]:hidden" />
      </Link>
      <form onSubmit={onSearch} role="search" className="relative min-w-0 flex-1 md:max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search documents..."
          aria-label="Search documents"
          className="h-10 w-full rounded-lg border border-line bg-bg pl-9 pr-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
      </form>
      <div className="ml-auto flex items-center gap-1">
        <div className="mr-2 hidden md:block"><UploadButton /></div>
        <Popover icon={<Bell className="h-5 w-5" />} label="Notifications">
          <p className="px-3 py-4 text-center text-sm text-muted">You're all caught up.</p>
        </Popover>
        <Popover icon={<Avatar url={avatarUrl} name={name} className="h-8 w-8 text-xs" />} label="Account menu">
          <div className="border-b border-line px-3 pb-2 pt-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <Link to="/settings" className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-subtle">
            <Settings className="h-4 w-4" aria-hidden /> Settings
          </Link>
          <button onClick={onSignOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-subtle">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </Popover>
      </div>
    </header>
  )
}
