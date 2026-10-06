import { UsernameField } from '@/components/auth/UsernameField'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { updatePassword } from '@/services/auth'
import { toMessage } from '@/lib/errors'
import { passwordIssue } from '@/utils/validation'

export function ResetPasswordPage() {
  const { session, loading: authLoading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (authLoading) return <FullPageSpinner />
  if (!session) {
    return (
      <AuthLayout title="Link expired" footer={<Link to="/login" className="font-semibold text-accent hover:underline">Back to sign in</Link>}>
        <p className="text-sm text-muted">This reset link is invalid or has expired. <Link to="/forgot-password" className="font-semibold text-accent hover:underline">Request a new one</Link>.</p>
      </AuthLayout>
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const issue = passwordIssue(password)
    if (issue) return setError(issue)
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    try {
      await updatePassword(password)
      window.location.replace('/') // full reload clears the recovery state
    } catch (err) {
      setError(toMessage(err, 'Could not update your password. Please try again.'))
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <UsernameField email={session?.user.email} />
        <Input label="New password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading}>Update password</Button>
      </form>
    </AuthLayout>
  )
}
