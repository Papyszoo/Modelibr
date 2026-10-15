import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/renderWithProviders'

import type { SceneOverlap } from '../../types'
import { SceneHierarchy } from '../SceneHierarchy'

function renderHierarchy(
  overrides: {
    visible?: boolean
    overlaps?: SceneOverlap[]
    onSelectNode?: jest.Mock
    onToggleVisible?: jest.Mock
    onRemoveNode?: jest.Mock
  } = {}
) {
  const onSelectNode = overrides.onSelectNode ?? jest.fn()
  const onToggleVisible = overrides.onToggleVisible ?? jest.fn()
  const onRemoveNode = overrides.onRemoveNode ?? jest.fn()

  renderWithProviders(
    <SceneHierarchy
      document={
        {
          nodes: [
            {
              id: 'node-1',
              name: 'Crate',
              visible: overrides.visible ?? true,
              asset: null,
              primitive: { shape: 'box' },
            },
          ],
          lights: [],
        } as never
      }
      nodeFacts={new Map()}
      failedNodes={new Map()}
      overlaps={overrides.overlaps ?? []}
      selectedNodeId={null}
      onSelectNode={onSelectNode}
      onToggleVisible={onToggleVisible}
      onRemoveNode={onRemoveNode}
    />
  )

  return { onSelectNode, onToggleVisible, onRemoveNode }
}

describe('SceneHierarchy node context menu', () => {
  // Regression: hierarchy rows had no right-click menu, so a right-click opened
  // the browser menu and the node actions were mouse-only icons.
  it('opens the shared menu on right-click and removes through it', async () => {
    const { onRemoveNode } = renderHierarchy()

    fireEvent.contextMenu(screen.getByTestId('scene-node-row'))

    expect(await screen.findByText('Select')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Remove'))

    expect(onRemoveNode).toHaveBeenCalledWith('node-1')
  })

  it('toggles a visible node to hidden from the menu', async () => {
    // The menu label is derived from the node's own state; a wrong branch would
    // hide an already hidden node instead of showing it.
    const { onToggleVisible } = renderHierarchy({ visible: true })

    fireEvent.contextMenu(screen.getByTestId('scene-node-row'))
    await userEvent.click(await screen.findByText('Hide'))

    expect(onToggleVisible).toHaveBeenCalledWith('node-1', false)
  })
})

describe('SceneHierarchy overlap flags', () => {
  function overlap(likelyIntentional: boolean): SceneOverlap {
    return {
      nodeIdA: 'node-1',
      nodeIdB: 'node-2',
      intersectionVolume: 0.5,
      kind: 'resting',
      likelyIntentional,
    }
  }

  it('does not flag an overlap the server marked likely intentional', () => {
    // Regression: every overlap was flagged, so deliberate contact - a lamp
    // resting on a table, which the server marks likelyIntentional - read as a
    // mistake the user did not make.
    renderHierarchy({ overlaps: [overlap(true)] })

    expect(screen.queryByText('overlapping')).not.toBeInTheDocument()
  })

  it('still flags an overlap that is not likely intentional', () => {
    // The other half: filtering must not silence genuine interpenetration.
    renderHierarchy({ overlaps: [overlap(false)] })

    expect(screen.getByText('overlapping')).toBeInTheDocument()
  })
})
