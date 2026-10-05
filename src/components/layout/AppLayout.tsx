import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { UploadProvider } from '@/hooks/useUploadQueue'
import { DropOverlay } from '@/components/upload/DropOverlay'
import { UploadQueuePanel } from '@/components/upload/UploadQueuePanel'
import { UploadFab } from '@/components/upload/UploadButton'
import { SchemaBanner } from './SchemaBanner'
import { OfflineBanner } from './OfflineBanner'
import { PinProvider } from '@/hooks/usePin'

export function AppLayout() {
  const { pathname } = useLocation()
  return (
    <PinProvider>
    <UploadProvider>
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <OfflineBanner />
        <SchemaBanner />
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-24 md:px-8 md:pb-8">
          <div className="mx-auto w-full max-w-6xl">
            <ErrorBoundary resetKey={pathname}>
              <Suspense fallback={<FullPageSpinner />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <MobileNav />
      <UploadFab />
      <UploadQueuePanel />
      <DropOverlay />
    </div>
    </UploadProvider>
    </PinProvider>
  )
}
