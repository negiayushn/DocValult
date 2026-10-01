import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

/** Temporary shell for screens that arrive in later build phases. Contains no mock data. */
export function ComingSoon({ title, icon, phase }: { title: string; icon: LucideIcon; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={icon} title={`${title} arrives in phase ${phase}`} description="This screen is wired into navigation and auth; its content is built in a later phase." />
    </>
  )
}
