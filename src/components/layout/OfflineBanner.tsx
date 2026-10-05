import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div role="status" className="flex items-center gap-2 border-b border-line bg-subtle px-4 py-2 text-sm md:px-6">
      <WifiOff className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span>You're offline. Your documents stay private on the server, so they need a connection. This page will reconnect by itself.</span>
    </div>
  )
}
