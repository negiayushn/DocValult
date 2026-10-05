import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import type { Tag } from '@/types/entities'

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function listTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from('tags').select('*').order('name').limit(1000)
  if (error) throw error
  return (data ?? []) as Tag[]
}

export async function getDocumentTags(documentId: string): Promise<Tag[]> {
  const { data, error } = await supabase.from('document_tags').select('tags(*)').eq('document_id', documentId)
  if (error) throw error
  const tags = ((data ?? []) as unknown as { tags: Tag | null }[]).map((r) => r.tags).filter((t): t is Tag => !!t)
  return tags.sort((a, b) => a.name.localeCompare(b.name))
}

/** Creates the tag, or returns the existing one with the same name (case-insensitive). */
export async function createTag(name: string): Promise<Tag> {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) throw new AppError('Enter a tag.')
  if (clean.length > 50) throw new AppError('Tags can be up to 50 characters.')
  const { data, error } = await supabase.from('tags').insert({ name: clean }).select('*').single()
  if (!error) return data as Tag
  if ((error as { code?: string }).code !== '23505') throw error
  const { data: existing, error: findError } = await supabase.from('tags').select('*').ilike('name', escapeLike(clean)).limit(1).maybeSingle()
  if (findError || !existing) throw findError ?? error
  return existing as Tag
}

export async function addTagToDocument(documentId: string, tagId: string): Promise<void> {
  const { error } = await supabase.from('document_tags').insert({ document_id: documentId, tag_id: tagId })
  if (error && (error as { code?: string }).code !== '23505') throw error // already tagged: fine
}

export async function removeTagFromDocument(documentId: string, tagId: string): Promise<void> {
  const { error } = await supabase.from('document_tags').delete().eq('document_id', documentId).eq('tag_id', tagId)
  if (error) throw error
}
