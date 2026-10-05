import { AlertTriangle } from 'lucide-react'
import { useSchemaVersion } from '@/hooks/useSchemaVersion'

/** Shown only when the database is behind the app. Explains the fix in one sentence. */
export function SchemaBanner() {
  const { outdated, data, required, refetch, isFetching } = useSchemaVersion()
  if (!outdated) return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm md:px-6">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <p className="min-w-0 flex-1">
        <strong>Your database is out of date</strong> (version {data}, needs {required}). Some features, such as search and folder counts, won't work until you run <code className="rounded bg-subtle px-1">supabase/catch_up.sql</code> in the Supabase SQL editor.
      </p>
      <button onClick={() => refetch()} disabled={isFetching} className="font-semibold underline-offset-2 hover:underline disabled:opacity-60">
        {isFetching ? 'Checking...' : 'Check again'}
      </button>
    </div>
  )
}
