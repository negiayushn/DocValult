import { LayoutDashboard, FileText, Folder, Star, Clock, Trash2, HardDrive, Settings, type LucideIcon } from 'lucide-react'

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

export const primaryNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/folders', label: 'Folders', icon: Folder },
  { to: '/favorites', label: 'Favorites', icon: Star },
  { to: '/recent', label: 'Recent', icon: Clock },
  { to: '/trash', label: 'Trash', icon: Trash2 },
]
export const secondaryNav: NavItem[] = [
  { to: '/storage', label: 'Storage', icon: HardDrive },
  { to: '/settings', label: 'Settings', icon: Settings },
]
