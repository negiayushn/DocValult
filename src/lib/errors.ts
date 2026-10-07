/** Turn any thrown value into a safe, human-readable message. Never leaks raw backend errors. */
export class AppError extends Error {}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Confirm your email address first, then sign in.',
  user_already_exists: 'An account with this email already exists. Try signing in.',
  weak_password: 'Choose a stronger password (at least 8 characters).',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  over_email_send_rate_limit: 'Too many emails requested. Wait a few minutes and try again.',
  same_password: 'Your new password must be different from the current one.',
  session_not_found: 'Your session has expired. Sign in again.',
}

export class PinCancelledError extends AppError {
  constructor() { super('Cancelled. The PIN was not entered.') }
}

export const PIN_REQUIRED_TEXT = 'Enter your PIN to continue, then try again.'

/** True when the server (database guard or Edge Function) refused because no recent PIN was entered. */
export function isPinRequired(err: unknown): boolean {
  const raw = typeof err === 'object' && err !== null ? String((err as { message?: string }).message ?? '') : ''
  return /PIN_REQUIRED/.test(raw) || raw === PIN_REQUIRED_TEXT
}

const PIN_MESSAGES: [RegExp, string][] = [
  [/PIN_REQUIRED/, PIN_REQUIRED_TEXT],
  [/PIN_INVALID/, 'Choose a 6-digit PIN that is not a simple pattern like 123456 or 111111.'],
  [/PIN_EXISTS/, 'A PIN is already set. Use Change PIN instead.'],
  [/SHARE_TOO_MANY/, 'You have too many active share links. Cancel some, then try again.'],
  [/SHARE_NOT_FOUND/, 'This document cannot be shared (it may be in Trash).'],
  [/SHARE_INVALID_EXPIRY/, 'Pick how long the link should work.'],
  [/RECENT_LOGIN_REQUIRED/, 'For safety, sign in again and then retry within two minutes.'],
]

export function toMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof AppError) return err.message
  const raw = typeof err === 'object' && err !== null ? String((err as { message?: string }).message ?? '') : ''
  for (const [re, msg] of PIN_MESSAGES) if (re.test(raw)) return msg
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: string; name?: string; message?: string; status?: number }
    if (e.code && AUTH_MESSAGES[e.code]) return AUTH_MESSAGES[e.code]
    // PostgREST: a function or table the app expects is missing, i.e. a migration hasn't been run yet.
    if (e.code === 'PGRST202' || e.code === 'PGRST205') {
      return 'The database is missing an update. In the Supabase SQL editor, run the files in supabase/migrations in order (0001 to 0008), then reload.'
    }
    if (e.name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(e.message ?? '')) {
      return 'Network problem. Check your connection and try again.'
    }
    if (e.status === 401 || e.status === 403) return 'You are not allowed to do that. Try signing in again.'
  }
  return fallback
}
