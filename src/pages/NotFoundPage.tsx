import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="This address doesn't lead anywhere in your vault."
      action={<Link to="/"><Button variant="secondary">Go to dashboard</Button></Link>}
    />
  )
}
