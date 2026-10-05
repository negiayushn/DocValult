import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { createAvatarUrl, getProfile, removeAvatar, updateDisplayName, uploadAvatar } from '@/services/profile'

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: !!user,
  })
}

export function useUpdateDisplayName() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => updateDisplayName(user!.id, name),
    onSuccess: (profile) => qc.setQueryData(['profile', user?.id], profile),
  })
}

/** Signed URL for the profile picture (null when none). Refreshes well before the 1 h link expires. */
export function useAvatarUrl() {
  const { data: profile } = useProfile()
  const path = profile?.avatar_url ?? null
  return useQuery({
    queryKey: ['avatarUrl', path],
    queryFn: () => createAvatarUrl(path!),
    enabled: !!path,
    staleTime: 50 * 60_000,
    retry: 1,
  })
}

export function useAvatarMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: profile } = useProfile()
  const done = (p: Awaited<ReturnType<typeof uploadAvatar>>) => qc.setQueryData(['profile', user?.id], p)
  return {
    upload: useMutation({ mutationFn: (file: File) => uploadAvatar(user!.id, file, profile?.avatar_url ?? null), onSuccess: done }),
    remove: useMutation({ mutationFn: () => removeAvatar(user!.id, profile?.avatar_url ?? null), onSuccess: done }),
  }
}
