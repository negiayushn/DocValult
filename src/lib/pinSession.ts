/** Per-tab record of the last moment the app was used while unlocked. Cleared on sign-in and sign-out so the PIN is asked right after login. */
const KEY = 'vault.activeAt'

export function readActiveAt(): number | null {
  try {
    const v = sessionStorage.getItem(KEY)
    return v ? Number(v) : null
  } catch { return null }
}
export function touchActive(now = Date.now()) {
  try { sessionStorage.setItem(KEY, String(now)) } catch { /* private mode: the app just asks for the PIN more often */ }
}
export function clearActive() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}
