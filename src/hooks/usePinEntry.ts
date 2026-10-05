import { useCallback, useEffect, useState } from 'react'
import { verifyPin } from '@/services/pin'
import { toMessage } from '@/lib/errors'

/** Shared "type your PIN and check it" logic for the lock screen and the confirm prompt. */
export function usePinEntry(onVerified: () => void, initialLockedSeconds = 0) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockLeft, setLockLeft] = useState(initialLockedSeconds)

  useEffect(() => {
    if (lockLeft <= 0) return
    const t = setInterval(() => setLockLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [lockLeft > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(async (pin: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await verifyPin(pin)
      if (r.ok) { setValue(''); onVerified(); return }
      setValue('')
      if (r.lockedSeconds > 0) setLockLeft(r.lockedSeconds)
      else setError(`Wrong PIN. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`)
    } catch (e) {
      setValue('')
      setError(toMessage(e, "Couldn't check your PIN. Check your connection and try again."))
    } finally {
      setBusy(false)
    }
  }, [busy, onVerified])

  const lockText = lockLeft > 0 ? `Too many wrong tries. Try again in ${Math.floor(lockLeft / 60)}:${String(lockLeft % 60).padStart(2, '0')}.` : null
  return { value, setValue, error: lockText ?? error, busy, locked: lockLeft > 0, submit }
}
