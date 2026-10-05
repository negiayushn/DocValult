import { useCallback, useMemo, useRef, useState } from 'react'

/** Multi-select over an ordered list of ids, with shift-click ranges. */
export function useSelection(orderedIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)

  const toggle = useCallback((id: string, shift = false) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shift && anchor.current && orderedIds.includes(anchor.current)) {
        const a = orderedIds.indexOf(anchor.current)
        const b = orderedIds.indexOf(id)
        const [lo, hi] = a < b ? [a, b] : [b, a]
        const adding = !prev.has(id)
        for (let i = lo; i <= hi; i++) adding ? next.add(orderedIds[i]) : next.delete(orderedIds[i])
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    anchor.current = id
  }, [orderedIds])

  const clear = useCallback(() => { setSelected(new Set()); anchor.current = null }, [])
  const selectAll = useCallback(() => setSelected(new Set(orderedIds)), [orderedIds])

  // Ignore ids that are no longer visible (deleted, filtered out).
  const visible = useMemo(() => new Set(orderedIds.filter((id) => selected.has(id))), [orderedIds, selected])
  return { selected: visible, toggle, clear, selectAll, allSelected: orderedIds.length > 0 && visible.size === orderedIds.length }
}
