import { Link, useNavigate } from 'react-router-dom'
import { Files, Folder as FolderIcon, HardDrive, Star, Upload } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { FileTypeIcon } from '@/components/documents/FileTypeIcon'
import { useStats, useRecentDocuments } from '@/hooks/useDocuments'
import { useFolderCounts, useFolders } from '@/hooks/useFolders'
import { useProfile } from '@/hooks/useProfile'
import { useUploadQueue } from '@/hooks/useUploadQueue'
import { STORAGE_QUOTA_BYTES } from '@/lib/config'
import { formatBytes, formatDate } from '@/utils/format'
import { pathTo } from '@/utils/folderTree'
import type { LucideIcon } from 'lucide-react'

function Stat({ icon: Icon, label, value, loading }: { icon: LucideIcon; label: string; value: string; loading: boolean }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Icon className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="truncate text-xl font-bold tabular-nums">{value}</p>}
      </div>
    </Card>
  )
}

export function DashboardPage() {
  const stats = useStats()
  const recent = useRecentDocuments(8)
  const foldersQ = useFolders()
  const countsQ = useFolderCounts()
  const { data: profile } = useProfile()
  const { openPicker } = useUploadQueue()
  const navigate = useNavigate()

  const s = stats.data
  const used = s?.storageUsed ?? 0
  const pct = Math.min(100, (used / STORAGE_QUOTA_BYTES) * 100)
  const folders = foldersQ.data ?? []
  const counts = countsQ.data ?? {}
  const topFolders = [...folders]
    .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || b.updated_at.localeCompare(a.updated_at))
    .slice(0, 6)
  const brandNew = s && s.totalDocuments === 0 && s.totalFolders === 0

  return (
    <>
      <PageHeader title={profile?.display_name ? `Welcome back, ${profile.display_name.split(' ')[0]}` : 'Dashboard'} description="Your vault at a glance." />

      {brandNew ? (
        <EmptyState icon={Files} title="Your vault is empty" description="Upload your first document or create a folder to get started." action={<Button onClick={() => openPicker()}><Upload className="h-4 w-4" aria-hidden /> Upload documents</Button>} />
      ) : (
        <div className="space-y-6">
          {stats.isError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">Couldn't load your totals. <button className="font-semibold underline" onClick={() => stats.refetch()}>Retry</button></p>}

          <section aria-label="Statistics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Files} label="Documents" value={String(s?.totalDocuments ?? 0)} loading={stats.isLoading} />
            <Stat icon={FolderIcon} label="Folders" value={String(s?.totalFolders ?? 0)} loading={stats.isLoading} />
            <Stat icon={HardDrive} label="Storage used" value={formatBytes(used)} loading={stats.isLoading} />
            <Stat icon={Star} label="Favorites" value={String(s?.favorites ?? 0)} loading={stats.isLoading} />
          </section>

          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold">Storage</h2>
              <p className="text-sm text-muted">{formatBytes(used)} / {formatBytes(STORAGE_QUOTA_BYTES)}</p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="min-w-0 lg:col-span-3">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-base font-semibold">Recent documents</h2>
                <Link to="/documents" className="-my-2 inline-flex min-h-10 items-center text-sm font-medium text-accent hover:underline">View all</Link>
              </div>
              {recent.isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : recent.isError ? (
                <p className="p-5 text-sm text-muted">Couldn't load recent documents.</p>
              ) : (recent.data ?? []).length === 0 ? (
                <p className="p-5 text-sm text-muted">Nothing here yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.data!.map((d) => (
                    <li key={d.id}>
                      <button onClick={() => navigate(`/documents/${d.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-subtle/60">
                        <FileTypeIcon type={d.file_type} className="shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{d.file_name}</span>
                          <span className="block text-xs text-muted">{formatBytes(d.file_size)} · {formatDate(d.updated_at)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="min-w-0 lg:col-span-2">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-base font-semibold">Folders</h2>
                <Link to="/folders" className="-my-2 inline-flex min-h-10 items-center text-sm font-medium text-accent hover:underline">Manage</Link>
              </div>
              {foldersQ.isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : topFolders.length === 0 ? (
                <p className="p-5 text-sm text-muted">No folders yet. <Link to="/folders" className="font-medium text-accent hover:underline">Create one</Link>.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {topFolders.map((f) => {
                    const n = counts[f.id] ?? 0
                    const parent = pathTo(folders, f.parent_id).map((p) => p.name).join(' / ')
                    return (
                      <li key={f.id}>
                        <Link to={`/folders/${f.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-subtle/60">
                          <FolderIcon className="h-5 w-5 shrink-0 fill-accent/15 text-accent" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{f.name}</span>
                            {parent && <span className="block truncate text-xs text-muted">in {parent}</span>}
                          </span>
                          <span className="shrink-0 text-xs text-muted">{n}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
