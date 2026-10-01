import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { FullPageSpinner } from '@/components/ui/Spinner'

/** Every document-management route lives under this guard. */
export function ProtectedRoute() {
  const { session, loading, recovering } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (recovering) return <Navigate to="/reset-password" replace />
  return <Outlet />
}

/** Login / signup / forgot-password: signed-in users are sent to the app. */
export function PublicOnlyRoute() {
  const { session, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}
