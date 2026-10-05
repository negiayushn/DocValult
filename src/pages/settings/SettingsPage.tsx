import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Laptop, LogOut, Moon, Sun, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { useAvatarMutations, useAvatarUrl, useProfile, useUpdateDisplayName } from '@/hooks/useProfile'
import { useTheme, type ThemeChoice } from '@/hooks/useTheme'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { useSchemaVersion } from '@/hooks/useSchemaVersion'
import { deleteAccount, signOut, updatePassword, verifyCurrentPassword } from '@/services/auth'
import { validateAvatar } from '@/services/profile'
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

function AvatarEditor({ name }: { name: string }) {
  const toast = useToast()
  const { data: profile } = useProfile()
  const { data: url } = useAvatarUrl()
  const { upload, remove } = useAvatarMutations()
  const input = useRef<HTMLInputElement>(null)
  const busy = upload.isPending || remove.isPending

  const onPick = async (file: File | undefined) => {
    if (input.current) input.current.value = '' // allow picking the same file again
    if (!file) return
    const problem = validateAvatar(file)
    if (problem) return toast.error(problem)
    try {
      await upload.mutateAsync(file)
      toast.success('Picture updated')
    } catch (err) {
      toast.error(toMessage(err, 'Could not upload your picture.'))
    }
  }
  const onRemove = async () => {
    try {
      await remove.mutateAsync()
      toast.success('Picture removed')
    } catch (err) {
      toast.error(toMessage(err, 'Could not remove your picture.'))
    }
  }

  return (
    <div className="mb-6 flex items-center gap-4">
      <Avatar url={url} name={name} className="h-20 w-20 text-xl" />
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a profile picture" tabIndex={-1} onChange={(e) => onPick(e.target.files?.[0])} />
        <Button variant="secondary" size="sm" loading={upload.isPending} disabled={busy} onClick={() => input.current?.click()}>
          <Camera className="h-4 w-4" aria-hidden /> {profile?.avatar_url ? 'Change picture' : 'Add picture'}
        </Button>
        {profile?.avatar_url && (
          <Button variant="ghost" size="sm" loading={remove.isPending} disabled={busy} onClick={onRemove}>Remove</Button>
        )}
        <p className="basis-full text-xs text-muted">PNG, JPG or WebP, up to 2 MB.</p>
      </div>
    </div>
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
        <>
        <AvatarEditor name={profile?.display_name || user?.email?.split('@')[0] || 'Account'} />
        <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} />
          <Input label="Email" value={user?.email ?? ''} readOnly disabled hint="Your email is your sign-in and can't be changed here." />
          <Button type="submit" loading={update.isPending}>Save changes</Button>
        </form>
        </>
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

function AppSection() {
  const { canInstall, installed, install } = useInstallPrompt()
  return (
    <Section title="Install app" description="Add Personal Vault to your home screen or desktop for one-tap access.">
      {installed ? (
        <p className="text-sm font-medium text-success">Installed on this device.</p>
      ) : canInstall ? (
        <Button variant="secondary" onClick={install}>Install Personal Vault</Button>
      ) : (
        <p className="text-sm text-muted">Your browser has not offered installation. On iPhone, tap Share, then Add to Home Screen. On Chrome or Edge, use the install icon in the address bar once you are on the deployed site.</p>
      )}
    </Section>
  )
}

function DatabaseSection() {
  const { data, isLoading, isError, outdated, required, refetch, isFetching } = useSchemaVersion()
  return (
    <Section title="Database" description="Whether your Supabase database has every update this version of the app needs.">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {isLoading ? <Skeleton className="h-6 w-40" /> : isError ? (
          <span className="text-danger">Couldn't check. Check your connection and try again.</span>
        ) : outdated ? (
          <span className="font-medium text-danger">Out of date: version {data}, needs {required}. Run supabase/catch_up.sql in the Supabase SQL editor.</span>
        ) : (
          <span className="font-medium text-success">Up to date (version {data}).</span>
        )}
        <Button variant="secondary" size="sm" loading={isFetching} onClick={() => refetch()}>Check again</Button>
      </div>
    </Section>
  )
}

function DangerSection() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => { if (!busy) { setOpen(false); setPassword(''); setTyped(''); setError(null) } }

  const onDelete = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (typed.trim() !== 'DELETE') return setError('Type DELETE to confirm.')
    if (!password) return setError('Enter your password.')
    setBusy(true)
    try {
      await verifyCurrentPassword(user!.email!, password)
    } catch {
      setBusy(false)
      return setError('Your password is incorrect.')
    }
    try {
      await deleteAccount()
      queryClient.clear()
      navigate('/login', { replace: true })
      toast.success('Your account and all files were deleted.')
    } catch (err) {
      setError(toMessage(err, 'Could not delete your account. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-danger/40 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-danger">Delete account</h2>
      <p className="mt-1 text-sm text-muted">Permanently deletes your account, folders, tags and every file. This cannot be undone.</p>
      <Button className="mt-4" variant="danger" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" aria-hidden /> Delete my account</Button>
      <Modal open={open} title="Delete your account?" onClose={close} busy={busy}>
        <form onSubmit={onDelete} className="space-y-4" noValidate>
          <p className="text-sm text-muted">Everything in your vault will be erased for good. Download anything you want to keep first.</p>
          <Input label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="danger" loading={busy}>Delete everything</Button>
          </div>
        </form>
      </Modal>
    </Card>
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
        <AppSection />
        <DatabaseSection />
        <DangerSection />
      </div>
    </>
  )
}
