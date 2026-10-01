import { Logo } from '@/components/ui/Logo'
import { NavList } from './NavList'

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-navy-950 p-4 md:flex">
      <Logo onDark className="px-2 pb-6 pt-2" />
      <NavList />
    </aside>
  )
}
