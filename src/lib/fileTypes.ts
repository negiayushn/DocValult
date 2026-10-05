import { MAX_FILE_SIZE_BYTES } from '@/lib/config'
import { formatBytes } from '@/utils/format'

export type FileCategory = 'pdf' | 'image' | 'document' | 'spreadsheet' | 'presentation' | 'text' | 'archive'

interface TypeInfo { mime: string[]; category: FileCategory }

/** Single source of truth for allowed uploads. Keep in sync with the bucket's allowed_mime_types in SQL. */
export const ALLOWED_TYPES: Record<string, TypeInfo> = {
  pdf: { mime: ['application/pdf'], category: 'pdf' },
  png: { mime: ['image/png'], category: 'image' },
  jpg: { mime: ['image/jpeg'], category: 'image' },
  jpeg: { mime: ['image/jpeg'], category: 'image' },
  webp: { mime: ['image/webp'], category: 'image' },
  doc: { mime: ['application/msword'], category: 'document' },
  docx: { mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], category: 'document' },
  xls: { mime: ['application/vnd.ms-excel'], category: 'spreadsheet' },
  xlsx: { mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], category: 'spreadsheet' },
  ppt: { mime: ['application/vnd.ms-powerpoint'], category: 'presentation' },
  pptx: { mime: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], category: 'presentation' },
  txt: { mime: ['text/plain'], category: 'text' },
  zip: { mime: ['application/zip', 'application/x-zip-compressed'], category: 'archive' },
}

export const ACCEPT_ATTR = Object.keys(ALLOWED_TYPES).map((e) => `.${e}`).join(',')

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  pdf: 'PDF', image: 'Image', document: 'Document', spreadsheet: 'Spreadsheet',
  presentation: 'Presentation', text: 'Text', archive: 'Archive',
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function categoryFor(name: string): FileCategory | null {
  return ALLOWED_TYPES[extensionOf(name)]?.category ?? null
}

/** The MIME type we upload with: the browser's value if it is allowed for this extension, else the canonical one. */
export function resolveMime(file: File): string {
  const info = ALLOWED_TYPES[extensionOf(file.name)]
  if (!info) return file.type
  return info.mime.includes(file.type) ? file.type : info.mime[0]
}

/** Returns a human-readable problem, or null if the file may be uploaded. */
export function validateFile(file: File): string | null {
  const name = file.name.trim()
  if (!name) return 'This file has no name.'
  if (name.length > 255) return 'The file name is too long (255 characters maximum).'
  const info = ALLOWED_TYPES[extensionOf(name)]
  if (!info) return `"${name}" is not a supported file type. Supported: ${Object.keys(ALLOWED_TYPES).map((e) => e.toUpperCase()).join(', ')}.`
  const t = file.type
  if (t && t !== 'application/octet-stream' && !info.mime.includes(t)) {
    return `"${name}" does not look like a real .${extensionOf(name)} file.`
  }
  if (file.size === 0) return `"${name}" is empty.`
  if (file.size > MAX_FILE_SIZE_BYTES) return `"${name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`
  return null
}
