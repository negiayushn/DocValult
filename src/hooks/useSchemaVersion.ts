import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { REQUIRED_SCHEMA_VERSION } from '@/lib/config'

/** 0 means the version function does not exist yet, i.e. the latest migrations have not been run. */
async function fetchVersion(): Promise<number> {
  const { data, error } = await supabase.rpc('vault_schema_version')
  if (error) {
    const code = (error as { code?: string }).code
    if (code === 'PGRST202' || code === '42883') return 0
    throw error
  }
  return Number(data ?? 0)
}

export function useSchemaVersion() {
  const q = useQuery({ queryKey: ['schemaVersion'], queryFn: fetchVersion, retry: false, staleTime: 5 * 60_000 })
  return {
    ...q,
    required: REQUIRED_SCHEMA_VERSION,
    outdated: q.data !== undefined && q.data < REQUIRED_SCHEMA_VERSION,
  }
}
