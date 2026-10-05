import { Download, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FileTypeIcon } from './FileTypeIcon'
import { CATEGORY_LABELS, type FileCategory } from '@/lib/fileTypes'
import { formatBytes, formatDate } from '@/utils/format'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import type { VaultDocument } from '@/types/entities'

export function DocumentList({ documents }: { documents: VaultDocument[] }) {
  const { open, download } = useDocumentActions()
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="hidden border-b border-line bg-subtle text-xs font-semibold text-muted sm:table-header-group">
          <tr>
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Type</th>
            <th className="px-4 py-2.5">Size</th>
            <th className="px-4 py-2.5">Modified</th>
            <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {documents.map((d) => (
            <tr key={d.id} className="hover:bg-subtle/60">
              <td className="max-w-0 px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileTypeIcon type={d.file_type} className="shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={d.file_name}>{d.file_name}</p>
                    <p className="text-xs text-muted sm:hidden">{formatBytes(d.file_size)} · {formatDate(d.updated_at)}</p>
                  </div>
                </div>
              </td>
              <td className="hidden px-4 py-3 text-muted sm:table-cell">{CATEGORY_LABELS[d.file_type as FileCategory] ?? d.file_type}</td>
              <td className="hidden px-4 py-3 text-muted sm:table-cell">{formatBytes(d.file_size)}</td>
              <td className="hidden px-4 py-3 text-muted sm:table-cell">{formatDate(d.updated_at)}</td>
              <td className="px-2 py-2 sm:px-4">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => open(d)} aria-label={`Open ${d.file_name}`}><ExternalLink className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => download(d)} aria-label={`Download ${d.file_name}`}><Download className="h-4 w-4" /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
