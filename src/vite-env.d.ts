/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  // Names created by the Vercel <-> Supabase integration (public values only).
  readonly NEXT_PUBLIC_SUPABASE_URL?: string
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
