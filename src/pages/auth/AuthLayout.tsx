import type { ReactNode } from 'react'
import { Logo } from '@/components/ui/Logo'
import { Card } from '@/components/ui/Card'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <p className="mt-6 text-sm text-muted">{footer}</p>}
    </div>
  )
}
