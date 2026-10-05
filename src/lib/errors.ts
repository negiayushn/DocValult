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

export function toMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof AppError) return err.message
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: string; name?: string; message?: string; status?: number }
    if (e.code && AUTH_MESSAGES[e.code]) return AUTH_MESSAGES[e.code]
    // PostgREST: a function or table the app expects is missing, i.e. a migration hasn't been run yet.
    if (e.code === 'PGRST202' || e.code === 'PGRST205') {
      return 'The database is missing an update. In the Supabase SQL editor, run the files in supabase/migrations in order (0001 to 0005), then reload.'
    }
    if (e.name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(e.message ?? '')) {
      return 'Network problem. Check your connection and try again.'
    }
    if (e.status === 401 || e.status === 403) return 'You are not allowed to do that. Try signing in again.'
  }
  return fallback
}
