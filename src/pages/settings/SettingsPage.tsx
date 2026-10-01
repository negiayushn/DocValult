import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Laptop, LogOut, Moon, Sun } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { useProfile, useUpdateDisplayName } from '@/hooks/useProfile'
import { useTheme, type ThemeChoice } from '@/hooks/useTheme'
import { signOut, updatePassword, verifyCurrentPassword } from '@/services/auth'
import { queryClient } from '@/lib/queryClient'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { passwordIssue } from '@/utils/validation'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  )
}

function ProfileSection() {
  const toast = useToast()
  const { user } = useAuth()
  const { data: profile, isLoading, isError } = useProfile()
  const update = useUpdateDisplayName()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setName(profile?.display_name ?? ''), [profile?.display_name])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Enter a name.')
    try {
      await update.mutateAsync(name)
      toast.success('Profile saved')
    } catch (err) {
      toast.error(toMessage(err, 'Could not save your profile.'))
    }
  }

  return (
    <Section title="Profile">
      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
      ) : isError ? (
        <p className="text-sm text-danger">Could not load your profile. Refresh and try again.</p>
      ) : (
        <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} />
          <Input label="Email" value={user?.email ?? ''} readOnly disabled hint="Your email is your sign-in and can't be changed here." />
          <Button type="submit" loading={update.isPending}>Save changes</Button>
        </form>
      )}
    </Section>
  )
}

function SecuritySection() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!current) return setError('Enter your current password.')
    const issue = passwordIssue(next)
    if (issue) return setError(issue)
    if (next !== confirm) return setError('New passwords do not match.')
    setLoading(true)
    try {
      await verifyCurrentPassword(user!.email!, current)
    } catch {
      setLoading(false)
      return setError('Your current password is incorrect.')
    }
    try {
      await updatePassword(next)
      setCurrent(''); setNext(''); setConfirm('')
      toast.success('Password updated')
    } catch (err) {
      setError(toMessage(err, 'Could not update your password.'))
    } finally {
      setLoading(false)
    }
  }

  const onSignOut = async () => {
    try {
      await signOut()
      queryClient.clear()
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(toMessage(err, 'Could not sign out.'))
    }
  }

  return (
    <Section title="Security" description="Change your password or sign out of this device.">
      <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
        <Input label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" loading={loading}>Change password</Button>
      </form>
      <div className="mt-6 border-t border-line pt-5">
        <Button variant="secondary" onClick={onSignOut}><LogOut className="h-4 w-4" aria-hidden /> Sign out</Button>
      </div>
    </Section>
  )
}

const themes: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
]

function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  return (
    <Section title="Appearance">
      <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-line bg-bg p-1">
        {themes.map((t) => (
          <button
            key={t.value}
            role="radio"
            aria-checked={theme === t.value}
            onClick={() => setTheme(t.value)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium',
              theme === t.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>
    </Section>
  )
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <ProfileSection />
        <SecuritySection />
        <AppearanceSection />
      </div>
    </>
  )
}
