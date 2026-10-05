import { useQuery } from '@tanstack/react-query'
import { getFolderDocCounts, listFolders } from '@/services/folders'

export const useFolders = () => useQuery({ queryKey: ['folders'], queryFn: listFolders })
export const useFolderCounts = () => useQuery({ queryKey: ['folderCounts'], queryFn: getFolderDocCounts, retry: false })
