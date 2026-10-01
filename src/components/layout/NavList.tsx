import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { primaryNav, secondaryNav, type NavItem } from './nav'

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive ? 'bg-navy-800 text-white' : 'text-slate-300 hover:bg-navy-900 hover:text-white',
        )
      }
    >
      <item.icon className="h-[18px] w-[18px]" aria-hidden />
      {item.label}
    </NavLink>
  )
}

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
      {primaryNav.map((i) => (
        <Item key={i.to} item={i} onNavigate={onNavigate} />
      ))}
      <div className="my-3 border-t border-white/10" />
      {secondaryNav.map((i) => (
        <Item key={i.to} item={i} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}
