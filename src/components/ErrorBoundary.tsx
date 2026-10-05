import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props { children: ReactNode; resetKey?: string; fullPage?: boolean }
interface State { failed: boolean }

/** Catches render errors so one broken screen never white-screens the whole app. Shows no technical details. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Deliberately console-only: no third-party reporting, and no document names or user data are logged.
    console.error('UI error:', error.message, info.componentStack?.split('\n').slice(0, 4).join('\n'))
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className={`grid place-items-center px-6 text-center ${this.props.fullPage ? 'min-h-screen bg-bg' : 'py-20'}`}>
        <div className="max-w-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger"><AlertTriangle className="h-6 w-6" aria-hidden /></span>
          <h1 className="mt-4 text-lg font-semibold">Something went wrong on this screen</h1>
          <p className="mt-1 text-sm text-muted">Your documents are safe. Reload to try again.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button variant="secondary" onClick={() => { window.location.assign('/') }}>Go to dashboard</Button>
          </div>
        </div>
      </div>
    )
  }
}
