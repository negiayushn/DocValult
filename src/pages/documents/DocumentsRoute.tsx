import { useSearchParams } from 'react-router-dom'
import { ExplorerPage } from './ExplorerPage'
import { SearchResultsPage } from './SearchResultsPage'

/** /documents shows the explorer, or search results when ?q= is present. */
export function DocumentsRoute() {
  const [params] = useSearchParams()
  const q = params.get('q')?.trim()
  return q ? <SearchResultsPage query={q} /> : <ExplorerPage />
}
