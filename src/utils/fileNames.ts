export function splitName(name: string): { stem: string; ext: string } {
  const i = name.lastIndexOf('.')
  if (i <= 0) return { stem: name, ext: '' }
  return { stem: name.slice(0, i), ext: name.slice(i) }
}

/** Returns `name`, or `name (1).ext`, `name (2).ext`... — whichever is free. `taken` holds lowercase names. */
export function pickUniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name.toLowerCase())) return name
  const { stem, ext } = splitName(name)
  for (let n = 1; n < 10_000; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return `${stem} (${Date.now()})${ext}`
}

/** Safe object-key segment: ASCII letters, digits, dot, dash, underscore. Keeps the extension. */
export function sanitizeForStorage(name: string, maxLength = 120): string {
  const { stem, ext } = splitName(name.normalize('NFKD'))
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+|[._]+$/g, '')
  const safeExt = clean(ext).slice(0, 12)
  const safeStem = (clean(stem) || 'file').slice(0, Math.max(1, maxLength - safeExt.length - 1))
  return safeExt ? `${safeStem}.${safeExt.replace(/^\./, '')}` : safeStem
}
