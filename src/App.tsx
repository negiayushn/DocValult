import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/hooks/useAuth'
import { ThemeProvider } from '@/hooks/useTheme'
import { ToastProvider } from '@/components/ui/Toast'
import { AppRoutes } from '@/routes/AppRoutes'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <ErrorBoundary fullPage>
                <AppRoutes />
              </ErrorBoundary>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
