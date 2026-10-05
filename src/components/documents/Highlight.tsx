export function Highlight({ text, term }: { text: string; term?: string }) {
  const t = term?.trim()
  if (!t) return <>{text}</>
  const i = text.toLowerCase().indexOf(t.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-accent-soft px-0.5 text-inherit">{text.slice(i, i + t.length)}</mark>
      {text.slice(i + t.length)}
    </>
  )
}
