import { useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { PinInput } from './PinInput'
import { usePinEntry } from '@/hooks/usePinEntry'

/** "Enter your PIN to continue" dialog for sensitive actions. */
export function PinPrompt({ reason, onVerified, onCancel }: { reason: string; onVerified: () => void; onCancel: () => void }) {
  const entry = usePinEntry(onVerified)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 50); return () => clearTimeout(t) }, [])
  useEffect(() => { if (!entry.busy && !entry.locked) input.current?.focus() }, [entry.busy, entry.locked])

  return (
    <Modal open title="Enter your PIN" onClose={onCancel} busy={entry.busy}>
      <p className="mb-4 text-sm text-muted">{reason}</p>
      <PinInput ref={input} value={entry.value} onChange={entry.setValue} onComplete={entry.submit} error={entry.error} disabled={entry.busy || entry.locked} />
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={entry.busy}>Cancel</Button>
      </div>
    </Modal>
  )
}
