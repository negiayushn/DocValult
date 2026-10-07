import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import { DOCUMENTS_BUCKET } from '@/lib/config'
import type { VaultDocument } from '@/types/entities'

export const SHARE_EXPIRIES = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
] as const

/** Sending the real file loads it into memory first, so keep it to a sensible size. */
export const MAX_FILE_SHARE_BYTES = 50 * 1024 * 1024

export interface ShareLink { code: string; url: string; expiresAt: string }

export const shareUrl = (code: string) => `${window.location.origin}/s/${code}`

/** Makes a short link (https://your-site/s/AbC123xYz9). It works until it expires or you cancel it. */
export async function createShareLink(documentId: string, seconds: number): Promise<ShareLink> {
  const { data, error } = await supabase.rpc('create_share_link', { p_document: documentId, p_seconds: seconds })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { code?: string; expires_at?: string } | undefined
  if (!row?.code || !row.expires_at) throw new AppError('Could not create a link for this file.')
  return { code: row.code, url: shareUrl(row.code), expiresAt: row.expires_at }
}

/** Links for one document that are still active. */
export async function listShareLinks(documentId: string): Promise<ShareLink[]> {
  const { data, error } = await supabase
    .from('share_links').select('code, expires_at')
    .eq('document_id', documentId).gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({ code: r.code as string, url: shareUrl(r.code as string), expiresAt: r.expires_at as string }))
}

export async function revokeShareLink(code: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_share_link', { p_code: code })
  if (error) throw error
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  try { return navigator.canShare({ files: [new File([''], 'x.txt', { type: 'text/plain' })] }) } catch { return false }
}

export async function loadFileForShare(doc: Pick<VaultDocument, 'storage_path' | 'file_name' | 'mime_type' | 'file_size'>): Promise<File> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path)
  if (error || !data) throw error ?? new AppError('Could not load this file to share it.')
  return new File([data], doc.file_name, { type: doc.mime_type || data.type || 'application/octet-stream' })
}

export interface ShareTargets { whatsapp: string; telegram: string; email: string }

export function shareTargets(fileName: string, link: string, when: string): ShareTargets {
  const text = `${fileName}\n${link}\n\n(Link works until ${when}.)`
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`${fileName} (link works until ${when})`)}`,
    email: `mailto:?subject=${encodeURIComponent(fileName)}&body=${encodeURIComponent(text)}`,
  }
}

export interface SharedFileInfo { name: string; size: number; mime: string; expiresAt: string }
export class ShareGoneError extends AppError {
  constructor() { super('This link has expired or was cancelled.') }
}

/** What a visitor (signed in or not) sees when they open a share link. Goes through the open-share Edge Function. */
export async function fetchSharedInfo(code: string): Promise<SharedFileInfo> {
  return callOpenShare<SharedFileInfo>(code, 'info')
}
export async function fetchSharedUrl(code: string, action: 'open' | 'download'): Promise<string> {
  return (await callOpenShare<{ url: string }>(code, action)).url
}

async function callOpenShare<T>(code: string, action: 'info' | 'open' | 'download'): Promise<T> {
  const { data, error } = await supabase.functions.invoke('open-share', { body: { code, action } })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404) throw new ShareGoneError()
    if (status === 404 || status === 401 || status === 403) throw new ShareGoneError()
    throw new AppError("Couldn't open this link right now. Try again in a moment.")
  }
  if (!data || (data as { error?: string }).error) throw new ShareGoneError()
  return data as T
}
