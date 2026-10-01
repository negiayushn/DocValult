import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { signUp } from '@/services/auth'
import { toMessage } from '@/lib/errors'
import { isEmail, passwordIssue } from '@/utils/validation'

export function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Enter your name.')
    if (!isEmail(email)) return setError('Enter a valid email address.')
    const issue = passwordIssue(password)
    if (issue) return setError(issue)
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    try {
      const { session } = await signUp(name.trim(), email.trim(), password)
      if (session) navigate('/', { replace: true })
      else setConfirmSent(true)
    } catch (err) {
      setError(toMessage(err, 'Could not create your account. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  if (confirmSent) {
    return (
      <AuthLayout title="Check your email" footer={<Link to="/login" className="font-semibold text-accent hover:underline">Back to sign in</Link>}>
        <div className="flex items-start gap-3 text-sm text-muted">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <p>We sent a confirmation link to <strong className="text-fg">{email}</strong>. Open it, then sign in.</p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Your documents stay private to you."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-accent hover:underline">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={loading}>Create account</Button>
      </form>
    </AuthLayout>
  )
}
