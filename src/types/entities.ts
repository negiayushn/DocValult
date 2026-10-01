/** Database entities. Regenerate with `supabase gen types typescript` if the schema grows. */
export interface Profile {
  id: string
  user_id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Folder {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

export interface VaultDocument {
  id: string
  user_id: string
  folder_id: string | null
  file_name: string
  storage_path: string
  file_type: string
  mime_type: string
  file_size: number
  description: string | null
  is_favorite: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Tag {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface DocumentTag {
  document_id: string
  tag_id: string
}
