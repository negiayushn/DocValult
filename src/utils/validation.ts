export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export function passwordIssue(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number.'
  return null
}

/** Shared rules for folder and document names (mirrors the database checks). */
export function nameIssue(name: string, label: string, max: number): string | null {
  const t = name.trim()
  if (!t) return `Enter a ${label}.`
  if (t.length > max) return `Use ${max} characters or fewer.`
  if (/[\\/]/.test(t)) return `A ${label} can't contain / or \\.`
  return null
}
