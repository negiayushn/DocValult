import { Clock } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DocumentCollection } from '@/components/documents/DocumentCollection'
import { useRecentDocuments } from '@/hooks/useDocuments'
import type { VaultDocument } from '@/types/entities'

function recency(d: VaultDocument): string {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(new Date()) - startOf(new Date(d.updated_at))) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : 'Earlier'
}

export function RecentPage() {
  const q = useRecentDocuments(50)
  return (
    <>
      <PageHeader title="Recent" description="Your 50 most recently added or changed documents." />
      <DocumentCollection
        docs={q.data ?? []}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        hasNextPage={false}
        fetchNextPage={() => {}}
        isFetchingNextPage={false}
        groupBy={recency}
        empty={{ icon: Clock, title: 'Nothing recent', description: 'Documents you upload or edit will show up here.' }}
      />
    </>
  )
}
