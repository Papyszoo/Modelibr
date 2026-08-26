import { Component, type ReactNode } from 'react'

interface SceneNodeErrorBoundaryProps {
  nodeId: string
  /**
   * Identifies what is being loaded - the asset URL plus the resources it needs.
   * When it changes, this node gets a fresh attempt, because the failure
   * belonged to what was being loaded before.
   */
  resetKey?: string
  onError: (nodeId: string, message: string) => void
  /**
   * Drops any cached failure for what this node was loading, called just before
   * a fresh attempt. Without it a retry is served the old rejection straight
   * out of the loader cache and fails again without touching the network.
   */
  onReset?: () => void
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
    if (!this.state.hasError) {
      return
    }

    // A node that was swapped to a different asset deserves a fresh attempt;
    // the failure belonged to the asset that is no longer there. So does one
    // whose resources have since arrived - a loose glTF that failed on a
    // missing .bin is loadable the moment its resource map is in hand, and
    // leaving it broken until a page reload is the difference between a
    // transient fetch failure and a permanently dead node.
    if (
      previous.nodeId !== this.props.nodeId ||
      previous.resetKey !== this.props.resetKey
    ) {
      // Before the retry renders, or the loader cache hands it the same
      // rejection back without a request.
      this.props.onReset?.()
      this.setState({ hasError: false })
    }
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
