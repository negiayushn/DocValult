import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'

export interface PinStatus {
  hasPin: boolean
  lockedSeconds: number
  lockAfterMinutes: number
  verifiedSeconds: number
  strictSeconds: number
}
export interface PinResult { ok: boolean; attemptsLeft: number; lockedSeconds: number }

const toResult = (data: unknown): PinResult => {
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  return { ok: r?.ok === true, attemptsLeft: Number(r?.attempts_left ?? 0), lockedSeconds: Number(r?.locked_seconds ?? 0) }
}

export async function getPinStatus(): Promise<PinStatus> {
  const { data, error } = await supabase.rpc('pin_status')
  if (error) throw error
  const r = ((data ?? [])[0] ?? {}) as Record<string, unknown>
  return {
    hasPin: r.has_pin === true,
    lockedSeconds: Number(r.locked_seconds ?? 0),
    lockAfterMinutes: Number(r.lock_after_minutes ?? 5),
    verifiedSeconds: Number(r.verified_seconds ?? 0),
    strictSeconds: Number(r.strict_seconds ?? 0),
  }
}

/** Ends the server-side unlocked windows. Best effort: the app is locked locally either way. */
export async function pinLockNow(): Promise<void> {
  try { await supabase.rpc('pin_lock_now') } catch { /* ignore */ }
}

export async function verifyPin(pin: string): Promise<PinResult> {
  const { data, error } = await supabase.rpc('verify_pin', { p_pin: pin })
  if (error) throw error
  return toResult(data)
}

export async function setPin(pin: string): Promise<void> {
  const { error } = await supabase.rpc('set_pin', { p_new: pin })
  if (error) throw error
}

export async function changePin(current: string, next: string): Promise<PinResult> {
  const { data, error } = await supabase.rpc('change_pin', { p_current: current, p_new: next })
  if (error) throw error
  return toResult(data)
}

export async function removePin(current: string): Promise<PinResult> {
  const { data, error } = await supabase.rpc('remove_pin', { p_current: current })
  if (error) throw error
  return toResult(data)
}

export async function setLockTimeout(minutes: number): Promise<void> {
  const { error } = await supabase.rpc('set_pin_lock_timeout', { p_minutes: minutes })
  if (error) throw error
}

/** Forgot-PIN: prove the account password by signing in again, then clear the PIN (the database checks the fresh login). */
export async function resetPinWithPassword(email: string, password: string): Promise<void> {
  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signErr) throw new AppError('That password is not correct.')
  const { error } = await supabase.rpc('reset_pin_after_login')
  if (error) throw error
}

/** Client-side check mirroring the database rule so people get instant feedback. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'Enter exactly 6 digits.'
  if (/^(\d)\1{5}$/.test(pin)) return 'Choose a PIN that is not the same digit repeated.'
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Choose a PIN that is not a simple run like 123456.'
  return null
}
