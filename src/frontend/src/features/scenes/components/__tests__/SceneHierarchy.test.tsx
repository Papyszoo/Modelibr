import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/renderWithProviders'

import { SceneHierarchy } from '../SceneHierarchy'

function renderHierarchy(
  overrides: {
    visible?: boolean
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
      overlaps={[]}
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
