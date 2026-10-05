import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PinInput } from './PinInput'
import { usePinEntry } from '@/hooks/usePinEntry'
import { useAuth } from '@/hooks/useAuth'
import { resetPinWithPassword } from '@/services/pin'
import { signOut } from '@/services/auth'
import { queryClient } from '@/lib/queryClient'
import { toMessage } from '@/lib/errors'

type Mode = 'loading' | 'locked' | 'error'

interface Props {
  mode: Mode
  initialLockedSeconds: number
  onUnlocked: () => void
  onPinRemoved: () => void
  onRetry: () => void
}

/** Full-screen cover shown until the PIN is entered. Opaque, so nothing behind it is visible. */
export function LockScreen({ mode, initialLockedSeconds, onUnlocked, onPinRemoved, onRetry }: Props) {
  const { user } = useAuth()
  const entry = usePinEntry(onUnlocked, initialLockedSeconds)
  const input = useRef<HTMLInputElement>(null)
  const [forgot, setForgot] = useState(false)
  const [password, setPassword] = useState('')
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotBusy, setForgotBusy] = useState(false)

  useEffect(() => { if (mode === 'locked' && !forgot && !entry.busy && !entry.locked) input.current?.focus() }, [mode, forgot, entry.busy, entry.locked])

  const doSignOut = async () => {
    try { await signOut() } finally { queryClient.clear(); window.location.assign('/login') }
  }

  const onForgot = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) return setForgotError('Enter your account password.')
    setForgotBusy(true); setForgotError(null)
    try {
      await resetPinWithPassword(user!.email!, password)
      onPinRemoved()
    } catch (err) {
      setForgotError(toMessage(err, 'Could not reset the PIN. Try again.'))
    } finally {
      setForgotBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="App locked" className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-bg px-5 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {mode === 'loading' && <div className="grid place-items-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" aria-label="Loading" /></div>}

          {mode === 'error' && (
            <div className="text-center">
              <p className="text-sm text-muted">Couldn't check your security settings. Check your connection.</p>
              <div className="mt-4 flex justify-center gap-2"><Button onClick={onRetry}>Try again</Button><Button variant="secondary" onClick={doSignOut}>Sign out</Button></div>
            </div>
          )}

          {mode === 'locked' && !forgot && (
            <>
              <div className="mb-5 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent"><Lock className="h-5 w-5" aria-hidden /></span>
                <h1 className="mt-3 text-lg font-semibold">Enter your PIN</h1>
                <p className="mt-1 text-sm text-muted">Your vault is locked.</p>
              </div>
              <PinInput ref={input} value={entry.value} onChange={entry.setValue} onComplete={entry.submit} error={entry.error} disabled={entry.busy || entry.locked} autoFocus />
              <div className="mt-5 flex items-center justify-between text-sm">
                <button className="font-medium text-accent hover:underline" onClick={() => { setForgot(true); setForgotError(null) }}>Forgot PIN?</button>
                <button className="text-muted hover:text-fg" onClick={doSignOut}>Sign out</button>
              </div>
            </>
          )}

          {mode === 'locked' && forgot && (
            <form onSubmit={onForgot} noValidate className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold">Reset your PIN</h1>
                <p className="mt-1 text-sm text-muted">Enter your account password. The PIN is removed and you can set a new one in Settings.</p>
              </div>
              <Input label="Account password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={forgotError} autoFocus />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => { setForgot(false); setPassword(''); setForgotError(null) }} disabled={forgotBusy}>Back</Button>
                <Button type="submit" loading={forgotBusy}>Reset PIN</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
