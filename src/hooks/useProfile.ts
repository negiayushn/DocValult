import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { getProfile, updateDisplayName } from '@/services/profile'

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
