import { useCallback, useMemo } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { toMessage } from '@/lib/errors'
import { deletePermanently, moveDocuments, renameDocument, restoreDocuments, setFavorite, softDeleteDocuments } from '@/services/documents'
import { createFolder, deleteFolder, moveFolder, renameFolder } from '@/services/folders'
import type { Folder, VaultDocument } from '@/types/entities'

type DocPage = { rows: VaultDocument[]; total: number }

/** Mutations for documents and folders. They throw on failure so dialogs can show the message inline. */
export function useExplorerActions() {
  const qc = useQueryClient()
  const toast = useToast()

  const refreshDocs = useCallback(() => {
    for (const key of ['documents', 'document', 'stats', 'recent', 'folderCounts', 'trash', 'trashCount']) qc.invalidateQueries({ queryKey: [key] })
  }, [qc])
  const refreshFolders = useCallback(() => {
    for (const key of ['folders', 'documents', 'stats', 'folderCounts', 'trash', 'trashCount']) qc.invalidateQueries({ queryKey: [key] })
  }, [qc])

  return useMemo(() => ({
    async renameDoc(doc: VaultDocument, name: string) {
      await renameDocument(doc, name)
      refreshDocs()
      toast.success('Renamed')
    },
    async moveDocs(docs: Pick<VaultDocument, 'id' | 'file_name' | 'folder_id'>[], folderId: string | null) {
      await moveDocuments(docs, folderId)
      refreshDocs()
      toast.success(docs.length === 1 ? 'Document moved' : `${docs.length} documents moved`)
    },
    async trashDocs(ids: string[]) {
      await softDeleteDocuments(ids)
      refreshDocs()
      toast.success(ids.length === 1 ? 'Moved to Trash' : `${ids.length} documents moved to Trash`)
    },
    async restoreDocs(docs: Pick<VaultDocument, 'id' | 'file_name' | 'folder_id'>[]) {
      await restoreDocuments(docs)
      refreshDocs()
      toast.success(docs.length === 1 ? 'Document restored' : `${docs.length} documents restored`)
    },
    async deleteForever(ids: string[]) {
      const n = await deletePermanently(ids)
      refreshDocs()
      toast.success(n === 1 ? 'Deleted permanently' : `${n} documents deleted permanently`)
    },
    async toggleFavorite(doc: VaultDocument) {
      const next = !doc.is_favorite
      // Optimistic: flip it in every cached page, roll back on failure.
      qc.setQueriesData<InfiniteData<DocPage>>({ queryKey: ['documents'] }, (old) =>
        old && { ...old, pages: old.pages.map((p) => ({ ...p, rows: p.rows.map((r) => (r.id === doc.id ? { ...r, is_favorite: next } : r)) })) },
      )
      try {
        await setFavorite(doc.id, next)
        for (const key of ['stats', 'documents', 'document', 'recent']) qc.invalidateQueries({ queryKey: [key] })
      } catch (e) {
        qc.invalidateQueries({ queryKey: ['documents'] })
        toast.error(toMessage(e, "Couldn't update favorite."))
      }
    },
    async createFolder(name: string, parentId: string | null) {
      await createFolder(name, parentId)
      refreshFolders()
      toast.success('Folder created')
    },
    async renameFolder(folder: Folder, name: string) {
      await renameFolder(folder.id, name)
      refreshFolders()
      toast.success('Renamed')
    },
    async moveFolder(folder: Folder, parentId: string | null) {
      await moveFolder(folder.id, parentId)
      refreshFolders()
      toast.success('Folder moved')
    },
    async deleteFolder(folder: Folder) {
      await deleteFolder(folder.id)
      refreshFolders()
      toast.success('Folder deleted')
    },
  }), [qc, toast, refreshDocs, refreshFolders])
}
