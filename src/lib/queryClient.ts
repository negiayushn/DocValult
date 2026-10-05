import { QueryClient } from '@tanstack/react-query'

/** Retry once for network blips, never for errors the server has already answered (permissions, missing function, bad input). */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false
  const e = error as { status?: number; code?: string } | null
  if (e?.status && e.status >= 400 && e.status < 500) return false
  if (e?.code && /^(PGRST|42|23|22)/.test(e.code)) return false
  return true
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
})
