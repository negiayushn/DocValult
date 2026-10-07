import { pinLockNow } from '@/services/pin'
import { supabase, REMEMBER_KEY } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import { clearActive } from '@/lib/pinSession'

export async function signIn(email: string, password: string, remember: boolean) {
  localStorage.setItem(REMEMBER_KEY, String(remember))
  clearActive() // a fresh login always asks for the PIN
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(displayName: string, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  clearActive()
  await pinLockNow()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/** Re-verifies the current password before allowing a change. */
export async function verifyCurrentPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Permanently deletes the account and every file, via the `delete-account` Edge Function (service role lives only there). */
export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) {
    // supabase-js hides the server's message inside error.context (a Response).
    const ctx = (error as { context?: Response }).context
    let message: string | undefined
    try { message = ctx ? ((await ctx.json()) as { error?: string }).error : undefined } catch { /* ignore */ }
    if (ctx && ctx.status === 403 && message === 'PIN_REQUIRED') message = 'Enter your PIN to continue, then try again.'
    if (ctx && ctx.status === 404) message = 'Account deletion is not set up yet. Deploy the delete-account function (see README).'
    throw new AppError(message ?? 'Could not delete the account. Check your connection and try again.')
  }
  if ((data as { error?: string } | null)?.error) throw new AppError((data as { error: string }).error)
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
}
