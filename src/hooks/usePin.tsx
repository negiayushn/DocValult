import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { LockScreen } from '@/components/pin/LockScreen'
import { PinPrompt } from '@/components/pin/PinPrompt'
import { getPinStatus, pinLockNow, type PinStatus } from '@/services/pin'
import { clearActive, readActiveAt, touchActive } from '@/lib/pinSession'
import { PinCancelledError, isPinRequired } from '@/lib/errors'

/** The browser trusts a verified PIN for 4 minutes; the database trusts it for 5, so the two never disagree. */
const SENSITIVE_MS = 4 * 60_000
/** Permanent deletes need a PIN entered in the last 25 seconds (the server allows 30). */
const STRICT_MS = 25_000

type View = 'loading' | 'locked' | 'open' | 'error'

interface PinContextValue {
  status: PinStatus | undefined
  hasPin: boolean
  /** Resolves immediately when no PIN is set or it was entered recently; otherwise asks, and rejects if cancelled. */
  requirePin: (reason: string, opts?: { strict?: boolean }) => Promise<void>
  /** Asks for the PIN if needed, runs the action, and if the server still says PIN_REQUIRED (its window is shorter than ours) asks again and retries once. */
  guarded: <T,>(reason: string, run: () => Promise<T>, opts?: { strict?: boolean }) => Promise<T>
  lockNow: () => void
  /** Call after the user has just proven the PIN (for example right after setting or changing it). */
  markVerified: () => void
  refreshStatus: () => Promise<void>
}

const PinContext = createContext<PinContextValue | null>(null)

export function PinProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const key = ['pinStatus', user?.id]
  const q = useQuery({ queryKey: key, queryFn: getPinStatus, enabled: !!user, staleTime: Infinity, retry: false })
  const status = q.data

  const [view, setView] = useState<View>('loading')
  const [prompt, setPrompt] = useState<string | null>(null)
  const sensitiveUntil = useRef(0)
  const strictUntil = useRef(0)
  const statusRef = useRef<PinStatus | undefined>(undefined)
  statusRef.current = status
  const pending = useRef<{ promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } | null>(null)
  const decided = useRef(false)

  // Decide once, when the status first arrives: open the app or show the lock.
  useEffect(() => {
    if (decided.current) return
    if (q.isError) {
      const code = (q.error as { code?: string } | null)?.code
      if (code === 'PGRST202' || code === '42883') { decided.current = true; setView('open') } // database predates the PIN feature
      else setView('error')
      return
    }
    if (!status) return
    decided.current = true
    if (!status.hasPin) { setView('open'); return }
    const activeAt = readActiveAt()
    const idleMs = status.lockAfterMinutes * 60_000
    const stillActive = status.lockAfterMinutes > 0 && activeAt !== null && Date.now() - activeAt < idleMs
    if (stillActive) {
      setView('open')
      if (status.verifiedSeconds > 0) sensitiveUntil.current = Date.now() + Math.min(status.verifiedSeconds * 1000, SENSITIVE_MS)
      if (status.strictSeconds > 0) strictUntil.current = Date.now() + Math.min(status.strictSeconds * 1000, STRICT_MS)
    } else setView('locked')
  }, [status, q.isError, q.error])

  const hasPin = !!status?.hasPin

  const lockNow = useCallback(() => {
    clearActive()
    sensitiveUntil.current = 0
    strictUntil.current = 0
    if (statusRef.current?.hasPin) void pinLockNow()
    if (statusRef.current?.hasPin) setView('locked')
  }, [])

  const markVerified = useCallback(() => {
    sensitiveUntil.current = Date.now() + SENSITIVE_MS
    strictUntil.current = Date.now() + STRICT_MS
    touchActive()
  }, [])

  const refreshStatus = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: key })
    await qc.refetchQueries({ queryKey: key })
  }, [qc, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-lock: idle timer, plus lock-on-hide when the setting is "every time I open the app".
  useEffect(() => {
    if (view !== 'open' || !hasPin || !status) return
    const idleMs = status.lockAfterMinutes * 60_000
    let lastTouch = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastTouch > 3000) { lastTouch = now; touchActive(now) }
    }
    const check = () => {
      const at = readActiveAt()
      if (idleMs > 0 && (at === null || Date.now() - at > idleMs)) lockNow()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && status.lockAfterMinutes === 0) lockNow()
      else if (document.visibilityState === 'visible') check()
    }
    touchActive()
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setInterval(check, 10_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }))
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
    }
  }, [view, hasPin, status, lockNow])

  // A PIN switched on or off elsewhere in the app must not leave a stale lock behind.
  useEffect(() => { if (status && !status.hasPin && view === 'locked') setView('open') }, [status, view])

  const requirePin = useCallback(async (reason: string, opts?: { strict?: boolean }) => {
    const st = statusRef.current ?? (await qc.fetchQuery<PinStatus>({ queryKey: key, queryFn: getPinStatus, staleTime: Infinity }))
    if (!st.hasPin) return
    if (Date.now() < (opts?.strict ? strictUntil.current : sensitiveUntil.current)) return
    if (pending.current) return pending.current.promise
    let resolve!: () => void
    let reject!: (e: unknown) => void
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
    pending.current = { promise, resolve, reject }
    setPrompt(reason)
    return promise
  }, [qc, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const guarded = useCallback(async <T,>(reason: string, run: () => Promise<T>, opts?: { strict?: boolean }): Promise<T> => {
    await requirePin(reason, opts)
    try {
      return await run()
    } catch (e) {
      if (!isPinRequired(e) || !statusRef.current?.hasPin) throw e
      sensitiveUntil.current = 0
      strictUntil.current = 0
      await requirePin(reason, opts)
      return await run()
    }
  }, [requirePin])

  const finishPrompt = (ok: boolean) => {
    const p = pending.current
    pending.current = null
    setPrompt(null)
    if (!p) return
    if (ok) { markVerified(); p.resolve() } else p.reject(new PinCancelledError())
  }

  const value = useMemo<PinContextValue>(() => ({ status, hasPin, requirePin, guarded, lockNow, markVerified, refreshStatus }), [status, hasPin, requirePin, guarded, lockNow, markVerified, refreshStatus])

  return (
    <PinContext.Provider value={value}>
      {/* inert while locked: no focus, no clicks, hidden from screen readers. The app stays mounted so uploads keep running. */}
      <div className="h-full" inert={view !== 'open'}>{children}</div>
      {view !== 'open' && (
        <LockScreen
          mode={view === 'locked' ? 'locked' : view === 'error' ? 'error' : 'loading'}
          initialLockedSeconds={status?.lockedSeconds ?? 0}
          onUnlocked={() => { markVerified(); setView('open') }}
          onPinRemoved={async () => { await refreshStatus(); markVerified(); setView('open'); toast.success('PIN removed. Set a new one in Settings.') }}
          onRetry={() => { setView('loading'); decided.current = false; void q.refetch() }}
        />
      )}
      {prompt && <PinPrompt reason={prompt} onVerified={() => finishPrompt(true)} onCancel={() => finishPrompt(false)} />}
    </PinContext.Provider>
  )
}

export function usePin() {
  const ctx = useContext(PinContext)
  if (!ctx) throw new Error('usePin must be used inside PinProvider')
  return ctx
}
