import type { Folder } from '@/types/entities'

const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })

export function childrenOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders.filter((f) => f.parent_id === parentId).sort(byName)
}

/** Root-to-folder chain, e.g. [Education, Certificates]. Empty if the id is unknown. */
export function pathTo(folders: Folder[], id: string | null): Folder[] {
  const map = new Map(folders.map((f) => [f.id, f]))
  const out: Folder[] = []
  let cur = id ? map.get(id) : undefined
  const guard = new Set<string>()
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id)
    out.unshift(cur)
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined
  }
  return out
}

/** The folder itself plus every folder below it. */
export function descendantIds(folders: Folder[], id: string): Set<string> {
  const out = new Set<string>([id])
  let frontier = [id]
  while (frontier.length) {
    const next: string[] = []
    for (const f of folders) {
      if (f.parent_id && frontier.includes(f.parent_id) && !out.has(f.id)) {
        out.add(f.id)
        next.push(f.id)
      }
    }
    frontier = next
  }
  return out
}

export interface FlatFolder { folder: Folder; depth: number }

export function flattenTree(folders: Folder[], parentId: string | null = null, depth = 0): FlatFolder[] {
  return childrenOf(folders, parentId).flatMap((f) => [{ folder: f, depth }, ...flattenTree(folders, f.id, depth + 1)])
}
