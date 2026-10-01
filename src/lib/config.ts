/** Central, configurable app limits. Mirrored by the storage bucket settings in SQL. */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
export const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB (display only)
export const DOCUMENTS_BUCKET = 'documents'
export const SIGNED_URL_TTL_SECONDS = 300
