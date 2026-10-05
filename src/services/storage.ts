import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import { DOCUMENTS_BUCKET, SIGNED_URL_TTL_SECONDS } from '@/lib/config'
import { sanitizeForStorage } from '@/utils/fileNames'

export class UploadCancelledError extends Error {
  constructor() { super('Upload cancelled') }
}

/** {user_id}/{document_id}/{filename} */
export function buildStoragePath(userId: string, documentId: string, fileName: string): string {
  return `${userId}/${documentId}/${sanitizeForStorage(fileName)}`
}

interface UploadOptions {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** supabase-js has no upload progress, so this talks to the Storage REST endpoint with XHR. */
export async function uploadWithProgress(path: string, file: File, mime: string, { onProgress, signal }: UploadOptions = {}) {
  if (signal?.aborted) throw new UploadCancelledError()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AppError('Your session has expired. Sign in again.')

  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')
  const url = `${base}/storage/v1/object/${DOCUMENTS_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const onAbort = () => xhr.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const done = () => signal?.removeEventListener('abort', onAbort)

    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', 'max-age=3600')
    xhr.setRequestHeader('Content-Type', mime)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      done()
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      if (xhr.status === 413) return reject(new AppError('This file is larger than the storage limit.'))
      if (xhr.status === 401 || xhr.status === 403) return reject(new AppError('Your session has expired. Sign in again.'))
      if (xhr.status === 400 || xhr.status === 415) return reject(new AppError('Storage rejected this file type.'))
      reject(new AppError('The upload failed. Please try again.'))
    }
    xhr.onerror = () => { done(); reject(new AppError('Network problem. Check your connection and try again.')) }
    xhr.onabort = () => { done(); reject(new UploadCancelledError()) }
    xhr.send(file)
  })
}

export async function createSignedUrl(path: string, opts: { download?: string | boolean } = {}): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, opts.download ? { download: opts.download } : undefined)
  if (error || !data?.signedUrl) throw error ?? new AppError('Could not create a link for this file.')
  return data.signedUrl
}

export async function createSignedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl
  return out
}

export async function removeObjects(paths: string[]) {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths)
  if (error) throw error
}
