import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import { extensionOf, type FileCategory } from '@/lib/fileTypes'
import { removeObjects } from '@/services/storage'
import { pickUniqueName } from '@/utils/fileNames'
import type { VaultDocument } from '@/types/entities'

export interface NewDocument {
  id: string
  folder_id: string | null
  file_name: string
  storage_path: string
  file_type: FileCategory
  mime_type: string
  file_size: number
}

/** user_id is never sent: the column defaults to auth.uid() and RLS rejects anything else. */
export async function createDocument(doc: NewDocument): Promise<VaultDocument> {
  const { data, error } = await supabase.from('documents').insert(doc).select('*').single()
  if (error) throw error
  return data as VaultDocument
}

export type SortField = 'name' | 'date' | 'size' | 'type'
export interface SortState { field: SortField; dir: 'asc' | 'desc' }
const SORT_COLUMN: Record<SortField, string> = { name: 'file_name', date: 'updated_at', size: 'file_size', type: 'file_type' }

export interface ListParams {
  /** undefined = all folders, null = root only, string = that folder */
  folderId?: string | null
  page?: number
  pageSize?: number
  sort?: SortState
  fileType?: FileCategory | null
  favoritesOnly?: boolean
}

export async function listDocuments({ folderId, page = 0, pageSize = 30, sort = { field: 'date', dir: 'desc' }, fileType, favoritesOnly }: ListParams = {}) {
  let q = supabase
    .from('documents')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order(SORT_COLUMN[sort.field], { ascending: sort.dir === 'asc' })
    .order('id')
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (folderId === null) q = q.is('folder_id', null)
  else if (folderId) q = q.eq('folder_id', folderId)
  if (fileType) q = q.eq('file_type', fileType)
  if (favoritesOnly) q = q.eq('is_favorite', true)
  const { data, error, count } = await q
  if (error) throw error
  return { rows: (data ?? []) as VaultDocument[], total: count ?? 0 }
}

export async function listRecentDocuments(limit = 8): Promise<VaultDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as VaultDocument[]
}

export interface DashboardStats {
  totalDocuments: number
  totalFolders: number
  favorites: number
  storageUsed: number
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats')
  if (error) throw error
  const r = ((data ?? [])[0] ?? {}) as Record<string, number | string | null>
  return {
    totalDocuments: Number(r.total_documents ?? 0),
    totalFolders: Number(r.total_folders ?? 0),
    favorites: Number(r.favorites ?? 0),
    storageUsed: Number(r.storage_used ?? 0),
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Lowercase names in a folder that start with the same stem, used to pick "name (1).ext". */
export async function listNamesLike(folderId: string | null, stem: string): Promise<Set<string>> {
  let q = supabase
    .from('documents')
    .select('file_name')
    .is('deleted_at', null)
    .ilike('file_name', `${escapeLike(stem)}%`)
    .limit(1000)
  q = folderId === null ? q.is('folder_id', null) : q.eq('folder_id', folderId)
  const { data, error } = await q
  if (error) throw error
  return new Set((data ?? []).map((r) => (r as { file_name: string }).file_name.toLowerCase()))
}

async function listAllNames(folderId: string | null): Promise<Set<string>> {
  let q = supabase.from('documents').select('file_name').is('deleted_at', null).limit(5000)
  q = folderId === null ? q.is('folder_id', null) : q.eq('folder_id', folderId)
  const { data, error } = await q
  if (error) throw error
  return new Set((data ?? []).map((r) => (r as { file_name: string }).file_name.toLowerCase()))
}

export async function renameDocument(doc: VaultDocument, newName: string): Promise<void> {
  const name = newName.trim()
  if (extensionOf(name) !== extensionOf(doc.file_name)) {
    throw new AppError(`Keep the .${extensionOf(doc.file_name)} extension so the file still opens correctly.`)
  }
  if (name.toLowerCase() !== doc.file_name.toLowerCase()) {
    const taken = await listNamesLike(doc.folder_id, name.slice(0, name.lastIndexOf('.')))
    if (taken.has(name.toLowerCase())) throw new AppError('A document with that name already exists in this folder.')
  }
  const { error } = await supabase.from('documents').update({ file_name: name }).eq('id', doc.id)
  if (error) throw error
}

/** Moves documents; any name that would collide in the destination gets a " (1)" suffix. */
export async function moveDocuments(docs: Pick<VaultDocument, 'id' | 'file_name' | 'folder_id'>[], folderId: string | null): Promise<void> {
  const moving = docs.filter((d) => d.folder_id !== folderId)
  if (moving.length === 0) return
  const taken = await listAllNames(folderId)
  const renames = new Map<string, string>()
  for (const d of moving) {
    const unique = pickUniqueName(d.file_name, taken)
    taken.add(unique.toLowerCase())
    if (unique !== d.file_name) renames.set(d.id, unique)
  }
  if (renames.size === 0) {
    const { error } = await supabase.from('documents').update({ folder_id: folderId }).in('id', moving.map((d) => d.id))
    if (error) throw error
    return
  }
  const results = await Promise.all(
    moving.map((d) => {
      const patch: { folder_id: string | null; file_name?: string } = { folder_id: folderId }
      const rename = renames.get(d.id)
      if (rename) patch.file_name = rename
      return supabase.from('documents').update(patch).eq('id', d.id)
    }),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

export async function softDeleteDocuments(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('documents').update({ deleted_at: new Date().toISOString() }).in('id', ids)
  if (error) throw error
}

export async function setFavorite(id: string, value: boolean): Promise<void> {
  const { error } = await supabase.from('documents').update({ is_favorite: value }).eq('id', id)
  if (error) throw error
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns null when the id is malformed, missing, or belongs to someone else (RLS hides it). */
export async function getDocument(id: string): Promise<VaultDocument | null> {
  if (!UUID.test(id)) return null
  const { data, error } = await supabase.from('documents').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as VaultDocument | null) ?? null
}

export async function updateDescription(id: string, description: string): Promise<void> {
  const text = description.trim()
  if (text.length > 2000) throw new AppError('The description is too long (2,000 characters maximum).')
  const { error } = await supabase.from('documents').update({ description: text || null }).eq('id', id)
  if (error) throw error
}

/** Filename, description, folder name and tag search. A full page means "maybe more". */
export async function searchDocuments({ query, fileType, page = 0, pageSize = 30 }: { query: string; fileType?: FileCategory | null; page?: number; pageSize?: number }) {
  const { data, error } = await supabase.rpc('search_documents', {
    p_query: query,
    p_file_type: fileType ?? null,
    p_limit: pageSize,
    p_offset: page * pageSize,
  })
  if (error) throw error
  return { rows: (data ?? []) as VaultDocument[], total: -1 }
}

/* ---------------------------------- Trash ---------------------------------- */

export async function listTrash({ page = 0, pageSize = 50 }: { page?: number; pageSize?: number } = {}) {
  const { data, error, count } = await supabase
    .from('documents')
    .select('*', { count: 'exact' })
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .order('id')
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as VaultDocument[], total: count ?? 0 }
}

/** Restores to the original folder if it still exists (otherwise the top level). A clashing name gets " (1)". */
export async function restoreDocuments(docs: Pick<VaultDocument, 'id' | 'file_name' | 'folder_id'>[]): Promise<void> {
  const byFolder = new Map<string | null, typeof docs>()
  for (const d of docs) byFolder.set(d.folder_id, [...(byFolder.get(d.folder_id) ?? []), d])
  for (const [folderId, group] of byFolder) {
    const taken = await listAllNames(folderId)
    const results = await Promise.all(
      group.map((d) => {
        const name = pickUniqueName(d.file_name, taken)
        taken.add(name.toLowerCase())
        const patch: { deleted_at: null; file_name?: string } = { deleted_at: null }
        if (name !== d.file_name) patch.file_name = name
        return supabase.from('documents').update(patch).eq('id', d.id).not('deleted_at', 'is', null)
      }),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) throw failed.error
  }
}

/**
 * Permanently deletes trashed documents. Storage objects go first; a row is only removed after its
 * file is gone, so a failure never leaves an orphaned file. Rows NOT in Trash are never touched.
 */
export async function deletePermanently(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const { data, error } = await supabase.from('documents').select('id, storage_path').in('id', ids).not('deleted_at', 'is', null)
  if (error) throw error
  const rows = (data ?? []) as { id: string; storage_path: string }[]
  if (rows.length === 0) return 0
  await removeObjects(rows.map((r) => r.storage_path))
  const { error: delError } = await supabase.from('documents').delete().in('id', rows.map((r) => r.id)).not('deleted_at', 'is', null)
  if (delError) throw delError
  return rows.length
}

export async function emptyTrash(onProgress?: (deleted: number) => void): Promise<{ deleted: number; error: unknown | null }> {
  let deleted = 0
  for (let guard = 0; guard < 1000; guard++) {
    const { data, error } = await supabase.from('documents').select('id').not('deleted_at', 'is', null).limit(50)
    if (error) return { deleted, error }
    const ids = (data ?? []).map((r) => (r as { id: string }).id)
    if (ids.length === 0) break
    try {
      const n = await deletePermanently(ids)
      if (n === 0) break
      deleted += n
      onProgress?.(deleted)
    } catch (e) {
      return { deleted, error: e }
    }
  }
  return { deleted, error: null }
}

export async function getTrashCount(): Promise<number> {
  const { count, error } = await supabase.from('documents').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null)
  if (error) throw error
  return count ?? 0
}

export interface StorageBreakdownRow {
  fileType: string
  activeCount: number
  activeBytes: number
  trashCount: number
  trashBytes: number
}

export async function getStorageBreakdown(): Promise<StorageBreakdownRow[]> {
  const { data, error } = await supabase.rpc('get_storage_breakdown')
  if (error) throw error
  return ((data ?? []) as Record<string, string | number>[]).map((r) => ({
    fileType: String(r.file_type),
    activeCount: Number(r.active_count),
    activeBytes: Number(r.active_bytes),
    trashCount: Number(r.trash_count),
    trashBytes: Number(r.trash_bytes),
  }))
}

export async function listLargestDocuments(limit = 10): Promise<VaultDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .is('deleted_at', null)
    .order('file_size', { ascending: false })
    .order('id')
    .limit(limit)
  if (error) throw error
  return (data ?? []) as VaultDocument[]
}
