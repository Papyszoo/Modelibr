import { Component, type ReactNode } from 'react'

interface SceneNodeErrorBoundaryProps {
  nodeId: string
  onError: (nodeId: string, message: string) => void
  fallback: ReactNode
  children: ReactNode
}

/**
 * Isolates one scene node's asset loading.
 *
 * A scene holds many assets, and any one of them can fail to load - a missing
 * buffer, an unreadable file, a format the browser cannot open. Without a
 * boundary per node that failure unmounts the whole canvas and the user loses
 * their view of an otherwise fine scene.
 *
 * Deliberately does NOT retry, unlike `CanvasErrorBoundary`: that one exists for
 * a known transient React 19 render-ordering error, whereas a broken asset
 * stays broken and retrying it three times just delays telling the user.
 */
export class SceneNodeErrorBoundary extends Component<
  SceneNodeErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    this.props.onError(this.props.nodeId, error.message)
  }

  componentDidUpdate(previous: SceneNodeErrorBoundaryProps): void {
    // A node that was swapped to a different asset deserves a fresh attempt;
    // the failure belonged to the asset that is no longer there.
    if (previous.nodeId !== this.props.nodeId && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
