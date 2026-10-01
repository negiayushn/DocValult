import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing Supabase configuration. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
  )
}

/**
 * "Remember me": when unchecked, the session lives in sessionStorage and is
 * gone when the browser closes. Otherwise it persists in localStorage.
 */
export const REMEMBER_KEY = 'vault.remember'
const pick = (): Storage =>
  localStorage.getItem(REMEMBER_KEY) === 'false' ? sessionStorage : localStorage

const sessionStore = {
  getItem: (k: string) => pick().getItem(k),
  setItem: (k: string, v: string) => pick().setItem(k, v),
  removeItem: (k: string) => {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  },
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: sessionStore,
  },
})
