import { useState } from 'react'

export type ViewMode = 'list' | 'grid'
const KEY = 'vault.view'

export function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [view, set] = useState<ViewMode>(() => (localStorage.getItem(KEY) === 'grid' ? 'grid' : 'list'))
  return [view, (v) => { localStorage.setItem(KEY, v); set(v) }]
}
