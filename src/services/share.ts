import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import { DOCUMENTS_BUCKET } from '@/lib/config'
import type { VaultDocument } from '@/types/entities'

export const SHARE_EXPIRIES = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
] as const

export const MAX_FILE_SHARE_BYTES = 50 * 1024 * 1024

/** Anyone holding the signed URL can access this private file until the expiry time. */
export async function createShareLink(path: string, seconds: number): Promise<string> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, seconds)
  if (error || !data?.signedUrl) throw error ?? new AppError('Could not create a link for this file.')
  return data.signedUrl
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  try { return navigator.canShare({ files: [new File([''], 'x.txt', { type: 'text/plain' })] }) } catch { return false }
}

export async function loadFileForShare(doc: Pick<VaultDocument, 'storage_path' | 'file_name' | 'mime_type' | 'file_size'>): Promise<File> {
  if (doc.file_size > MAX_FILE_SHARE_BYTES) throw new AppError('This file is too large to send directly (over 50 MB). Share a link instead.')
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path)
  if (error || !data) throw error ?? new AppError('Could not load this file to share it.')
  return new File([data], doc.file_name, { type: doc.mime_type || data.type || 'application/octet-stream' })
}

export interface ShareTargets { whatsapp: string; telegram: string; email: string }

export function shareTargets(fileName: string, link: string, expiresLabel: string): ShareTargets {
  const text = `${fileName}\n${link}\n\n(This link works for ${expiresLabel}.)`
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`${fileName} (link works for ${expiresLabel})`)}`,
    email: `mailto:?subject=${encodeURIComponent(fileName)}&body=${encodeURIComponent(text)}`,
  }
}
