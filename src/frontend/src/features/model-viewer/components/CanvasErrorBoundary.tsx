import { Component, type ReactNode } from 'react'

interface CanvasErrorBoundaryProps {
  children: ReactNode
  /**
   * Shown when the subtree has failed. Omit it for the transient React 19
   * render-ordering error this boundary was built for (it auto-retries and
   * shows the viewer message only after the retries are spent); provide it when
   * the failure is a specific resource, so the user sees exactly what was lost
   * (a broken environment map, a viewport that could not be drawn).
   */
  fallback?: ReactNode
  /**
   * Resets the boundary and its retry budget when it changes. Pass whatever
   * identifies what was being rendered (the environment map URL, the scene): a
   * new resource deserves a fresh attempt, while the same broken one would only
   * fail again.
   */
  resetKey?: string
}

interface CanvasErrorBoundaryState {
  hasError: boolean
  retryCount: number
}

/**
 * Local error boundary for an R3F Canvas subtree.
 *
 * In React 19 production builds, "Cannot update a component while rendering
 * a different component" (Error #310) is thrown as a real error - not just a
 * console warning. This can happen when React Query's useSyncExternalStore
 * resolves cached data during the same render pass as R3F's internal Gl
 * component. The error is transient: on retry the data is already cached
 * and stable, so the Canvas renders without conflict.
 *
 * This boundary catches that transient error, briefly shows nothing, then
 * auto-retries up to 3 times. A permanent failure (an environment map the
 * loader cannot decode) also retries, then falls back to `fallback` (or the
 * viewer message when none is given) instead of unmounting the whole app.
 */
export class CanvasErrorBoundary extends Component<
  CanvasErrorBoundaryProps,
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

  componentDidUpdate(previous: CanvasErrorBoundaryProps): void {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer)
        this.retryTimer = null
      }
      this.setState({ hasError: false, retryCount: 0 })
    }
  }

  componentWillUnmount(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }
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
