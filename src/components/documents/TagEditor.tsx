import { useMemo, useState, type KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useDocumentTags, useTags } from '@/hooks/useDocuments'
import { addTagToDocument, createTag, removeTagFromDocument } from '@/services/tags'
import { toMessage } from '@/lib/errors'

export function TagEditor({ documentId }: { documentId: string }) {
  const toast = useToast()
  const qc = useQueryClient()
  const tagsQ = useDocumentTags(documentId)
  const allQ = useTags()
  const [value, setValue] = useState('')

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['documentTags', documentId] })
    qc.invalidateQueries({ queryKey: ['tags'] })
    qc.invalidateQueries({ queryKey: ['documents'] }) // search matches tag names
  }
  const add = useMutation({
    mutationFn: async (name: string) => addTagToDocument(documentId, (await createTag(name)).id),
    onSuccess: () => { setValue(''); refresh() },
    onError: (e) => toast.error(toMessage(e, "Couldn't add the tag.")),
  })
  const remove = useMutation({
    mutationFn: (tagId: string) => removeTagFromDocument(documentId, tagId),
    onSuccess: refresh,
    onError: (e) => toast.error(toMessage(e, "Couldn't remove the tag.")),
  })

  const attached = tagsQ.data ?? []
  const suggestions = useMemo(() => {
    const have = new Set(attached.map((t) => t.id))
    return (allQ.data ?? []).filter((t) => !have.has(t.id))
  }, [allQ.data, attached])

  const submit = () => { const v = value.trim(); if (v && !add.isPending) add.mutate(v) }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); submit() }
    if (e.key === 'Backspace' && !value && attached.length) remove.mutate(attached[attached.length - 1].id)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tagsQ.isError && <span className="text-sm text-danger">Couldn't load tags.</span>}
        {attached.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1.5 text-xs font-medium text-accent">
            {t.name}
            <button onClick={() => remove.mutate(t.id)} aria-label={`Remove tag ${t.name}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-surface/60"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        onBlur={submit}
        list="vault-tag-suggestions"
        maxLength={50}
        placeholder="Add a tag and press Enter"
        aria-label="Add a tag"
        disabled={add.isPending}
        className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
      />
      <datalist id="vault-tag-suggestions">{suggestions.map((t) => <option key={t.id} value={t.name} />)}</datalist>
    </div>
  )
}
