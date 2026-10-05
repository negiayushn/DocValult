import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DocumentCollection } from '@/components/documents/DocumentCollection'
import { useDocuments } from '@/hooks/useDocuments'
import type { FileCategory } from '@/lib/fileTypes'
import type { SortState } from '@/services/documents'

export function FavoritesPage() {
  const [sort, setSort] = useState<SortState>({ field: 'date', dir: 'desc' })
  const [fileType, setFileType] = useState<FileCategory | null>(null)
  const q = useDocuments({ sort, fileType, favoritesOnly: true })
  const docs = useMemo(() => q.data?.pages.flatMap((p) => p.rows) ?? [], [q.data])

  return (
    <>
      <PageHeader title="Favorites" description="Documents you've starred." />
      <DocumentCollection
        docs={docs}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        hasNextPage={!!q.hasNextPage}
        fetchNextPage={() => q.fetchNextPage()}
        isFetchingNextPage={q.isFetchingNextPage}
        toolbar={{ sort, onSort: setSort, fileType, onFileType: setFileType }}
        empty={{ icon: Star, title: fileType ? 'No favorites of that type' : 'No favorites yet', description: fileType ? 'Try another type.' : 'Open the menu on any document and choose "Add to favorites" to find it here quickly.' }}
      />
    </>
  )
}
