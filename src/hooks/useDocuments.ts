import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getDashboardStats, getStorageBreakdown, listLargestDocuments, getDocument, getTrashCount, listDocuments, listRecentDocuments, listTrash, searchDocuments, type SortState } from '@/services/documents'
import { getDocumentTags, listTags } from '@/services/tags'
import { createSignedUrl } from '@/services/storage'
import type { FileCategory } from '@/lib/fileTypes'

export const PAGE_SIZE = 30

export function useDocuments(opts: { folderId?: string | null; sort: SortState; fileType: FileCategory | null; favoritesOnly?: boolean; enabled?: boolean }) {
  const { folderId, sort, fileType, favoritesOnly, enabled = true } = opts
  return useInfiniteQuery({
    queryKey: ['documents', { folderId: folderId === undefined ? 'all' : folderId ?? 'root', sort, fileType, favoritesOnly: !!favoritesOnly }],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listDocuments({ folderId, sort, fileType, favoritesOnly, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0)
      return loaded < last.total ? pages.length : undefined
    },
  })
}

export function useSearchDocuments(opts: { query: string; fileType: FileCategory | null; enabled: boolean }) {
  const { query, fileType, enabled } = opts
  return useInfiniteQuery({
    queryKey: ['documents', 'search', query, fileType],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => searchDocuments({ query, fileType, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last, pages) => (last.rows.length === PAGE_SIZE ? pages.length : undefined),
  })
}

export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: getDashboardStats })
export const useRecentDocuments = (limit = 8) => useQuery({ queryKey: ['recent', limit], queryFn: () => listRecentDocuments(limit) })
export const useDocument = (id: string | undefined) => useQuery({ queryKey: ['document', id], queryFn: () => getDocument(id!), enabled: !!id })
export const useTrashCount = () => useQuery({ queryKey: ['trashCount'], queryFn: getTrashCount })
export const useTags = () => useQuery({ queryKey: ['tags'], queryFn: listTags })
export const useDocumentTags = (documentId: string | undefined) => useQuery({ queryKey: ['documentTags', documentId], queryFn: () => getDocumentTags(documentId!), enabled: !!documentId })

export function useTrash() {
  return useInfiniteQuery({
    queryKey: ['trash'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listTrash({ page: pageParam, pageSize: 50 }),
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.rows.length, 0) < last.total ? pages.length : undefined),
  })
}

/** Short-lived signed URL. Not cached beyond the page; callers refetch when it nears expiry. */
export function useSignedUrl(path: string | undefined) {
  return useQuery({
    queryKey: ['signedUrl', path],
    queryFn: () => createSignedUrl(path!),
    enabled: !!path,
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
  })
}

export const useStorageBreakdown = () => useQuery({ queryKey: ['stats', 'breakdown'], queryFn: getStorageBreakdown, retry: false })
export const useLargestDocuments = (limit = 10) => useQuery({ queryKey: ['stats', 'largest', limit], queryFn: () => listLargestDocuments(limit) })
