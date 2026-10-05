import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import { AVATARS_BUCKET, AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/lib/config'
import { formatBytes } from '@/utils/format'
import type { Profile } from '@/types/entities'

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function updateDisplayName(userId: string, displayName: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName.trim() })
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  return data as Profile
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Returns a human-readable problem, or null if the image may be used as an avatar. */
export function validateAvatar(file: File): string | null {
  if (!AVATAR_MIME_TYPES.includes(file.type)) return 'Choose a PNG, JPG or WebP image.'
  if (file.size === 0) return 'This image is empty.'
  if (file.size > AVATAR_MAX_BYTES) return `This image is ${formatBytes(file.size)}. The limit is ${formatBytes(AVATAR_MAX_BYTES)}.`
  return null
}

async function setAvatarPath(userId: string, path: string | null): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: path })
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  return data as Profile
}

/** Uploads a new avatar, points the profile at it, then deletes the previous file. */
export async function uploadAvatar(userId: string, file: File, previousPath: string | null): Promise<Profile> {
  const problem = validateAvatar(file)
  if (problem) throw new AppError(problem)
  const path = `${userId}/avatar-${Date.now()}.${EXT[file.type]}`
  const { error: upErr } = await supabase.storage.from(AVATARS_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) throw upErr
  let profile: Profile
  try {
    profile = await setAvatarPath(userId, path)
  } catch (e) {
    await supabase.storage.from(AVATARS_BUCKET).remove([path]) // don't leave an orphan behind
    throw e
  }
  if (previousPath && previousPath !== path) await supabase.storage.from(AVATARS_BUCKET).remove([previousPath])
  return profile
}

export async function removeAvatar(userId: string, previousPath: string | null): Promise<Profile> {
  const profile = await setAvatarPath(userId, null)
  if (previousPath) await supabase.storage.from(AVATARS_BUCKET).remove([previousPath])
  return profile
}

export async function createAvatarUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(AVATARS_BUCKET).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) throw error ?? new AppError('Could not load your picture.')
  return data.signedUrl
}
