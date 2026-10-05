import { File, FileArchive, FileSpreadsheet, FileText, Image, Presentation, type LucideIcon } from 'lucide-react'
import type { FileCategory } from '@/lib/fileTypes'
import { cn } from '@/lib/cn'

const icons: Record<FileCategory, LucideIcon> = {
  pdf: FileText, image: Image, document: FileText, spreadsheet: FileSpreadsheet,
  presentation: Presentation, text: FileText, archive: FileArchive,
}

export function FileTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = icons[type as FileCategory] ?? File
  return <Icon className={cn('h-5 w-5', className)} aria-hidden />
}
