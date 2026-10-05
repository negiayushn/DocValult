import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Folder } from '@/types/entities'

export function Breadcrumbs({ path }: { path: Folder[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      <Link to="/documents" className={path.length ? 'py-2 text-muted hover:text-fg' : 'py-2 font-semibold'}>Documents</Link>
      {path.map((f, i) => (
        <span key={f.id} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          {i === path.length - 1 ? (
            <span className="truncate font-semibold" aria-current="page">{f.name}</span>
          ) : (
            <Link to={`/folders/${f.id}`} className="truncate py-2 text-muted hover:text-fg">{f.name}</Link>
          )}
        </span>
      ))}
    </nav>
  )
}
