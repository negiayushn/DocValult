/**
 * Supabase connection settings. Only PUBLIC values are read here.
 * Accepts the names from .env.example (VITE_*) and the names the Vercel <-> Supabase integration creates
 * (NEXT_PUBLIC_*). vite.config.ts exposes only those two prefixes, so SUPABASE_SERVICE_ROLE_KEY and other
 * server-side variables can never reach the browser bundle.
 */
const e = import.meta.env
const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined)

export const SUPABASE_URL = clean(e.VITE_SUPABASE_URL) ?? clean(e.NEXT_PUBLIC_SUPABASE_URL)
export const SUPABASE_KEY =
  clean(e.VITE_SUPABASE_PUBLISHABLE_KEY) ??
  clean(e.VITE_SUPABASE_ANON_KEY) ??
  clean(e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
  clean(e.NEXT_PUBLIC_SUPABASE_ANON_KEY)

export const SUPABASE_CONFIGURED = !!SUPABASE_URL && !!SUPABASE_KEY
