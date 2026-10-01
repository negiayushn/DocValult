import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute, PublicOnlyRoute } from './guards'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { SignupPage } from '@/pages/auth/SignupPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const DocumentsPage = lazy(() => import('@/pages/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const RecentPage = lazy(() => import('@/pages/documents/RecentPage').then((m) => ({ default: m.RecentPage })))
const FoldersPage = lazy(() => import('@/pages/folders/FoldersPage').then((m) => ({ default: m.FoldersPage })))
const FavoritesPage = lazy(() => import('@/pages/favorites/FavoritesPage').then((m) => ({ default: m.FavoritesPage })))
const TrashPage = lazy(() => import('@/pages/trash/TrashPage').then((m) => ({ default: m.TrashPage })))
const StoragePage = lazy(() => import('@/pages/settings/StoragePage').then((m) => ({ default: m.StoragePage })))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="recent" element={<RecentPage />} />
          <Route path="folders" element={<FoldersPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="storage" element={<StoragePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
