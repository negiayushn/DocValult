import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { ACCEPT_ATTR, categoryFor, resolveMime, validateFile } from '@/lib/fileTypes'
import { AppError, toMessage } from '@/lib/errors'
import { buildStoragePath, removeObjects, uploadWithProgress, UploadCancelledError } from '@/services/storage'
import { createDocument, listNamesLike } from '@/services/documents'
import { pickUniqueName, splitName } from '@/utils/fileNames'

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled'

export interface UploadItem {
  id: string
  file: File
  /** Name the document is saved under (may get a " (1)" suffix once the upload starts). */
  name: string
  folderId: string | null
  status: UploadStatus
  progress: number // 0..1
  error: string | null
}

interface UploadApi {
  items: UploadItem[]
  activeCount: number
  enqueue: (files: File[], folderId?: string | null) => void
  openPicker: (folderId?: string | null) => void
  /** Where uploads go when no folder is given (set by the explorer to the open folder). */
  setTargetFolder: (folderId: string | null) => void
  cancel: (id: string) => void
  retry: (id: string) => void
  clearFinished: () => void
}

const Ctx = createContext<UploadApi | null>(null)
const CONCURRENCY = 3

export function UploadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const userId = user?.id

  const itemsRef = useRef<UploadItem[]>([])
  const [items, setItems] = useState<UploadItem[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const reserved = useRef(new Set<string>())
  const running = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const pickerFolder = useRef<string | null>(null)
  const targetFolder = useRef<string | null>(null)

  const commit = useCallback(() => setItems([...itemsRef.current]), [])
  const patch = useCallback((id: string, p: Partial<UploadItem>) => {
    itemsRef.current = itemsRef.current.map((i) => (i.id === id ? { ...i, ...p } : i))
    commit()
  }, [commit])
  const get = (id: string) => itemsRef.current.find((i) => i.id === id)

  const reserveName = async (item: UploadItem): Promise<string> => {
    const { stem } = splitName(item.file.name.trim())
    const existing = await listNamesLike(item.folderId, stem)
    // Synchronous from here on, so two parallel uploads can't claim the same name.
    const taken = new Set(existing)
    for (const key of reserved.current) {
      const [folder, name] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)]
      if (folder === (item.folderId ?? 'root')) taken.add(name)
    }
    const name = pickUniqueName(item.file.name.trim(), taken)
    reserved.current.add(`${item.folderId ?? 'root'}|${name.toLowerCase()}`)
    return name
  }

  const pumpRef = useRef<() => void>(() => {})

  const run = useCallback(async (id: string) => {
    const item = get(id)
    if (!item || !userId) {
      running.current -= 1
      return
    }
    const controller = new AbortController()
    controllers.current.set(id, controller)
    patch(id, { status: 'uploading', progress: 0, error: null })

    let reservedKey: string | null = null
    let path: string | null = null
    let uploaded = false
    let success = false
    try {
      const name = await reserveName(item)
      reservedKey = `${item.folderId ?? 'root'}|${name.toLowerCase()}`
      patch(id, { name })

      const documentId = crypto.randomUUID()
      path = buildStoragePath(userId, documentId, name)
      const mime = resolveMime(item.file)
      await uploadWithProgress(path, item.file, mime, {
        signal: controller.signal,
        onProgress: (f) => patch(id, { progress: f }),
      })
      uploaded = true
      if (controller.signal.aborted) throw new UploadCancelledError()

      try {
        await createDocument({
          id: documentId,
          folder_id: item.folderId,
          file_name: name,
          storage_path: path,
          file_type: categoryFor(name)!,
          mime_type: mime,
          file_size: item.file.size,
        })
      } catch {
        throw new AppError("The file uploaded but its details couldn't be saved, so the upload was undone. Try again.")
      }
      success = true
      patch(id, { status: 'done', progress: 1 })
      for (const key of ['documents', 'stats', 'recent', 'folderCounts']) qc.invalidateQueries({ queryKey: [key] })
    } catch (e) {
      if (e instanceof UploadCancelledError) patch(id, { status: 'cancelled', error: null })
      else patch(id, { status: 'error', error: toMessage(e, 'The upload failed. Please try again.') })
    } finally {
      // No row means no object: remove anything we managed to store.
      if (!success && uploaded && path) removeObjects([path]).catch(() => {})
      if (!success && reservedKey) reserved.current.delete(reservedKey)
      controllers.current.delete(id)
      running.current -= 1
      pumpRef.current()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, patch, qc])

  const pump = useCallback(() => {
    for (const item of itemsRef.current) {
      if (running.current >= CONCURRENCY) break
      if (item.status !== 'queued') continue
      running.current += 1
      void run(item.id)
    }
  }, [run])
  pumpRef.current = pump

  const enqueue = useCallback((files: File[], folderArg?: string | null) => {
    if (!userId || files.length === 0) return
    const folderId = folderArg === undefined ? targetFolder.current : folderArg
    const accepted: UploadItem[] = []
    const rejected: string[] = []
    for (const file of files) {
      const problem = validateFile(file)
      if (problem) { rejected.push(problem); continue }
      accepted.push({
        id: crypto.randomUUID(), file, name: file.name.trim(), folderId,
        status: 'queued', progress: 0, error: null,
      })
    }
    if (rejected.length) {
      toast.error(rejected.length === 1 ? rejected[0] : `${rejected.length} files were skipped. First problem: ${rejected[0]}`)
    }
    if (accepted.length) {
      itemsRef.current = [...itemsRef.current, ...accepted]
      commit()
      pump()
    }
  }, [userId, toast, commit, pump])

  const cancel = useCallback((id: string) => {
    const item = get(id)
    if (!item) return
    if (item.status === 'queued') patch(id, { status: 'cancelled' })
    else if (item.status === 'uploading') controllers.current.get(id)?.abort()
  }, [patch])

  const retry = useCallback((id: string) => {
    const item = get(id)
    if (!item || (item.status !== 'error' && item.status !== 'cancelled')) return
    patch(id, { status: 'queued', progress: 0, error: null })
    pump()
  }, [patch, pump])

  const clearFinished = useCallback(() => {
    itemsRef.current = itemsRef.current.filter((i) => i.status === 'queued' || i.status === 'uploading')
    commit()
  }, [commit])

  const openPicker = useCallback((folderId?: string | null) => {
    pickerFolder.current = folderId === undefined ? targetFolder.current : folderId
    inputRef.current?.click()
  }, [])
  const setTargetFolder = useCallback((folderId: string | null) => { targetFolder.current = folderId }, [])

  const activeCount = items.filter((i) => i.status === 'queued' || i.status === 'uploading').length

  // Warn before closing the tab mid-upload; abort everything when the vault unmounts (sign out).
  useEffect(() => {
    if (activeCount === 0) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [activeCount])
  useEffect(() => {
    const map = controllers.current
    return () => map.forEach((c) => c.abort())
  }, [])

  const api = useMemo<UploadApi>(
    () => ({ items, activeCount, enqueue, openPicker, setTargetFolder, cancel, retry, clearFinished }),
    [items, activeCount, enqueue, openPicker, setTargetFolder, cancel, retry, clearFinished],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          enqueue(Array.from(e.target.files ?? []), pickerFolder.current)
          e.target.value = ''
        }}
      />
    </Ctx.Provider>
  )
}

export function useUploadQueue() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useUploadQueue must be used inside UploadProvider')
  return c
}
