/** Hidden username so password managers and browsers can tie a password form to the account. */
export function UsernameField({ email }: { email?: string | null }) {
  return <input type="text" name="username" autoComplete="username" value={email ?? ''} readOnly hidden aria-hidden tabIndex={-1} />
}
