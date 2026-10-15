import { fireEvent, screen, waitFor, within } from '@testing-library/react'

import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'

import type { SceneNode } from '../../types'
import { SceneNodeAnimation } from '../SceneNodeAnimation'

const mockGet = client.get as jest.Mock

const WAVE = {
  name: 'Wave',
  durationSeconds: 1,
  kinds: ['skeletal'],
}

const SQUASH = {
  meshName: 'Box',
  names: ['Squash', 'Stretch'],
}

function modelWith(technicalMetadata: Record<string, unknown>) {
  return Promise.resolve({
    data: {
      id: '12',
      name: 'Kid',
      files: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      technicalMetadata: {
        latestVersionId: 34,
        animations: [],
        shapeKeys: [],
        ...technicalMetadata,
      },
    },
  })
}

function node(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: 'kid-1',
    name: 'Kid',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    asset: { assetType: 'Model', assetId: 12, versionId: 34 },
    visible: true,
    ...overrides,
  }
}

function dropdownPanel(): HTMLElement {
  const panel = document.querySelector('.p-dropdown-panel')
  if (!panel) throw new Error('dropdown panel not open')
  return panel as HTMLElement
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockImplementation((url: string) =>
    String(url).includes('/models/12')
      ? modelWith({ animations: [WAVE], shapeKeys: [SQUASH] })
      : Promise.resolve({ data: {} })
  )
})

describe('SceneNodeAnimation', () => {
  it('offers a clip per extracted animation and writes the placed defaults', async () => {
    // The regression: choosing a clip must write a complete, valid node
    // animation - a missing loop/speed/timeOffset would be read as 0-speed
    // noise by the document reader, or rejected by the validator.
    const onChange = jest.fn()
    renderWithProviders(
      <SceneNodeAnimation node={node()} onChange={onChange} />
    )

    await screen.findByTestId('scene-node-animation-group')

    fireEvent.click(screen.getByTestId('scene-node-animation-clip'))
    fireEvent.click(within(dropdownPanel()).getByText('Wave - 1.00 s'))

    expect(onChange).toHaveBeenCalledWith({
      animation: { clip: 'Wave', loop: true, speed: 1, timeOffset: 0 },
    })
  })

  it('clears the animation through the same select', async () => {
    const onChange = jest.fn()
    renderWithProviders(
      <SceneNodeAnimation
        node={node({
          animation: { clip: 'Wave', loop: true, speed: 1, timeOffset: 0 },
        })}
        onChange={onChange}
      />
    )

    await screen.findByTestId('scene-node-animation-group')

    fireEvent.click(screen.getByTestId('scene-node-animation-clip'))
    fireEvent.click(within(dropdownPanel()).getByText('None (rest pose)'))

    expect(onChange).toHaveBeenCalledWith({ animation: null })
  })

  it('writes the playback speed through the same node patch', async () => {
    // The regression: a speed control that looks editable but whose value never
    // reaches the document, so the node keeps playing at 1x after a save.
    const onChange = jest.fn()
    renderWithProviders(
      <SceneNodeAnimation
        node={node({
          animation: { clip: 'Wave', loop: true, speed: 1, timeOffset: 0 },
        })}
        onChange={onChange}
      />
    )

    await screen.findByTestId('scene-node-animation-group')

    const input = screen.getByTestId('scene-node-animation-speed')
    fireEvent.change(input, { target: { value: '2.5' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    expect(onChange).toHaveBeenCalledWith({
      animation: { clip: 'Wave', loop: true, speed: 2.5, timeOffset: 0 },
    })
  })

  it('writes a shape-key weight from its slider', async () => {
    // The regression: a slider that only looks right - the patch must land on
    // the node's `shapeKeys` map under the model's own key name.
    const onChange = jest.fn()
    renderWithProviders(
      <SceneNodeAnimation node={node()} onChange={onChange} />
    )

    const slider = await screen.findByTestId('scene-node-shapekey-Squash')
    // PageUp is ten steps of 0.01 -> 0.10 on the 0..1 slider.
    fireEvent.keyDown(within(slider).getByRole('slider'), { key: 'PageUp' })

    const patch = onChange.mock.calls.at(-1)?.[0] as {
      shapeKeys: Record<string, number>
    }
    expect(Object.keys(patch.shapeKeys)).toEqual(['Squash'])
    expect(patch.shapeKeys.Squash).toBeCloseTo(0.1, 5)
    // The other declared key is untouched: weights are not written wholesale.
    expect(patch.shapeKeys.Stretch).toBeUndefined()
  })

  it('shows only the groups the selected model can actually drive', async () => {
    const { unmount } = renderWithProviders(
      <SceneNodeAnimation node={node()} onChange={jest.fn()} />
    )

    await screen.findByTestId('scene-node-animation-group')
    expect(screen.getByTestId('scene-node-shapekeys')).toBeInTheDocument()
    unmount()

    // A morph-only model gets shape keys and no Animation group; a clip-only
    // model gets the converse. A section whose controls can do nothing teaches
    // people to ignore the panel.
    mockGet.mockImplementation(() =>
      modelWith({ animations: [], shapeKeys: [SQUASH] })
    )
    const morphOnly = renderWithProviders(
      <SceneNodeAnimation node={node()} onChange={jest.fn()} />
    )
    await screen.findByTestId('scene-node-shapekeys')
    expect(
      screen.queryByTestId('scene-node-animation-group')
    ).not.toBeInTheDocument()
    morphOnly.unmount()

    mockGet.mockImplementation(() =>
      modelWith({ animations: [WAVE], shapeKeys: [] })
    )
    const clipOnly = renderWithProviders(
      <SceneNodeAnimation node={node()} onChange={jest.fn()} />
    )
    await screen.findByTestId('scene-node-animation-group')
    expect(screen.queryByTestId('scene-node-shapekeys')).not.toBeInTheDocument()
    clipOnly.unmount()
  })

  it('renders nothing for a static model', async () => {
    mockGet.mockImplementation(() => modelWith({}))

    renderWithProviders(
      <SceneNodeAnimation node={node()} onChange={jest.fn()} />
    )

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/models/12'))
    expect(screen.queryByTestId('scene-node-animation')).not.toBeInTheDocument()
  })

  it('renders nothing and asks nothing for a blockout primitive', () => {
    renderWithProviders(
      <SceneNodeAnimation
        node={node({ asset: null, primitive: { shape: 'box' } })}
        onChange={jest.fn()}
      />
    )

    expect(screen.queryByTestId('scene-node-animation')).not.toBeInTheDocument()
    expect(mockGet).not.toHaveBeenCalled()
  })
})
