/** Central, configurable app limits. Mirrored by the storage bucket settings in SQL. */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
export const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB (display only)
export const DOCUMENTS_BUCKET = 'documents'
export const SIGNED_URL_TTL_SECONDS = 300
export const AVATARS_BUCKET = 'avatars'
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024 // 2 MB, mirrored by the avatars bucket
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** The database version this build of the app needs (see vault_schema_version() in supabase/migrations). */
export const REQUIRED_SCHEMA_VERSION = 5
