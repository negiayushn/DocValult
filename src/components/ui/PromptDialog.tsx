import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { Input } from './Input'
import { Button } from './Button'
import { toMessage } from '@/lib/errors'

interface Props {
  open: boolean
  title: string
  label: string
  initialValue?: string
  confirmLabel: string
  validate?: (value: string) => string | null
  onSubmit: (value: string) => Promise<void>
  onClose: () => void
}

export function PromptDialog({ open, title, label, initialValue = '', confirmLabel, validate, onSubmit, onClose }: Props) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    setError(null)
    const t = setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const dot = initialValue.lastIndexOf('.')
      el.setSelectionRange(0, dot > 0 ? dot : initialValue.length) // select the name, not the extension
    }, 30)
    return () => clearTimeout(t)
  }, [open, initialValue])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validate?.(value) ?? null
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await onSubmit(value.trim())
      onClose()
    } catch (err) {
      setError(toMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={title} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate>
        <Input ref={inputRef} label={label} value={value} onChange={(e) => setValue(e.target.value)} error={error} autoComplete="off" />
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}
