import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import type { Folder } from '@/types/entities'

function mapFolderError(e: unknown): never {
  const code = (e as { code?: string } | null)?.code
  if (code === '23505') throw new AppError('A folder with that name already exists here.')
  if (code === '23514') throw new AppError("A folder can't be moved into itself or one of its own subfolders.")
  throw e
}

export async function listFolders(): Promise<Folder[]> {
  const { data, error } = await supabase.from('folders').select('*').order('name').limit(5000)
  if (error) throw error
  return (data ?? []) as Folder[]
}

export async function getFolderDocCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_folder_doc_counts')
  if (error) throw error
  const out: Record<string, number> = {}
  for (const r of (data ?? []) as { folder_id: string; document_count: number | string }[]) out[r.folder_id] = Number(r.document_count)
  return out
}

export async function createFolder(name: string, parentId: string | null): Promise<Folder> {
  const { data, error } = await supabase.from('folders').insert({ name: name.trim(), parent_id: parentId }).select('*').single()
  if (error) mapFolderError(error)
  return data as Folder
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('folders').update({ name: name.trim() }).eq('id', id)
  if (error) mapFolderError(error)
}

export async function moveFolder(id: string, parentId: string | null): Promise<void> {
  const { error } = await supabase.from('folders').update({ parent_id: parentId }).eq('id', id)
  if (error) mapFolderError(error)
}

/** Moves the folder's documents (and those in subfolders) to Trash, then deletes the folders. */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_folder', { p_folder_id: id })
  if (error) throw error
}
