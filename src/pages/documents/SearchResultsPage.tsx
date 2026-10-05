import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SearchX, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DocumentCollection } from '@/components/documents/DocumentCollection'
import { useSearchDocuments } from '@/hooks/useDocuments'
import { toMessage } from '@/lib/errors'
import type { FileCategory } from '@/lib/fileTypes'

export function SearchResultsPage({ query }: { query: string }) {
  const navigate = useNavigate()
  const [fileType, setFileType] = useState<FileCategory | null>(null)
  const q = useSearchDocuments({ query, fileType, enabled: true })
  const docs = useMemo(() => q.data?.pages.flatMap((p) => p.rows) ?? [], [q.data])

  return (
    <>
      <PageHeader
        title={`Results for "${query}"`}
        description="Matches file names, descriptions, folder names and tags."
        actions={<button onClick={() => navigate('/documents')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-subtle"><X className="h-4 w-4" aria-hidden /> Clear search</button>}
      />
      <DocumentCollection
        docs={docs}
        highlight={query}
        isLoading={q.isLoading}
        isError={q.isError}
        errorText={q.isError ? toMessage(q.error, 'Check your connection and try again.') : undefined}
        onRetry={() => q.refetch()}
        hasNextPage={!!q.hasNextPage}
        fetchNextPage={() => q.fetchNextPage()}
        isFetchingNextPage={q.isFetchingNextPage}
        toolbar={{ sort: { field: 'date', dir: 'desc' }, onSort: () => {}, fileType, onFileType: setFileType, hideSort: true }}
        empty={{
          icon: SearchX,
          title: `No results for "${query}"`,
          description: fileType ? 'Try another type, or clear the filter.' : 'Check the spelling, or try a shorter word. Documents in Trash are not searched.',
          action: <Link to="/documents" className="inline-flex min-h-10 items-center text-sm font-semibold text-accent hover:underline">Back to all documents</Link>,
        }}
      />
    </>
  )
}
