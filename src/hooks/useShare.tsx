import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ShareDialog } from '@/components/share/ShareDialog'
import type { VaultDocument } from '@/types/entities'

interface ShareContextValue { share: (doc: VaultDocument) => void }
const ShareContext = createContext<ShareContextValue | null>(null)

/** One share dialog for the whole app: any page can call `share(doc)`. */
export function ShareProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<VaultDocument | null>(null)
  const share = useCallback((d: VaultDocument) => setDoc(d), [])
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
