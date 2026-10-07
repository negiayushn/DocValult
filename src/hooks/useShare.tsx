import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ShareDialog } from '@/components/share/ShareDialog'
import { useToast } from '@/components/ui/Toast'
import { usePin } from '@/hooks/usePin'
import { toMessage } from '@/lib/errors'
import type { VaultDocument } from '@/types/entities'

interface ShareContextValue { share: (doc: VaultDocument) => Promise<void> }
const ShareContext = createContext<ShareContextValue | null>(null)

/** One share dialog for the whole app: any page can call `share(doc)`. */
export function ShareProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<VaultDocument | null>(null)
  const toast = useToast()
  const { requirePin } = usePin()
  // The PIN is asked BEFORE the dialog opens, so the buttons inside can use the browser's share sheet straight
  // from a tap (browsers only allow it right after a tap, not after a wait).
  const share = useCallback(async (d: VaultDocument) => {
    try { await requirePin('Enter your PIN to share this document.') } catch (e) { toast.error(toMessage(e)); return }
    setDoc(d)
  }, [requirePin, toast])
  const value = useMemo(() => ({ share }), [share])
  return (
    <ShareContext.Provider value={value}>
      {children}
      <ShareDialog doc={doc} onClose={() => setDoc(null)} />
    </ShareContext.Provider>
  )
}

export function useShare() {
  const ctx = useContext(ShareContext)
  if (!ctx) throw new Error('useShare must be used inside ShareProvider')
  return ctx
}
