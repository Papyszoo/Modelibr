import { Component, type ReactNode } from 'react'

interface CanvasErrorBoundaryState {
  hasError: boolean
  retryCount: number
}

/**
 * Local error boundary for the R3F Canvas.
 *
 * In React 19 production builds, "Cannot update a component while rendering
 * a different component" (Error #310) is thrown as a real error — not just a
 * console warning. This can happen when React Query's useSyncExternalStore
 * resolves cached data during the same render pass as R3F's internal Gl
 * component. The error is transient: on retry the data is already cached
 * and stable, so the Canvas renders without conflict.
 *
 * This boundary catches that transient error, briefly shows nothing, then
 * auto-retries up to 3 times.
 */
export class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  CanvasErrorBoundaryState
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  state: CanvasErrorBoundaryState = { hasError: false, retryCount: 0 }

  static getDerivedStateFromError(): Partial<CanvasErrorBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(): void {
    if (this.state.retryCount < 3) {
      this.retryTimer = setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          retryCount: prev.retryCount + 1,
        }))
      }, 100)
    }
  }

  componentWillUnmount(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.state.retryCount >= 3) {
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              color: 'var(--text-color-secondary)',
            }}
          >
            <span>3D viewer failed to load. Please refresh the page.</span>
          </div>
        )
      }
      return null
    }
    return this.props.children
  }
}
