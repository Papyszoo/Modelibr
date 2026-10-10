import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'

import { renderWithProviders } from '@/test/renderWithProviders'

import {
  ModelContextMenu,
  type ModelContextMenuHandle,
} from '../ModelContextMenu'

jest.mock('@/features/models/api/modelApi', () => ({
  softDeleteModel: jest.fn().mockResolvedValue(undefined),
  updateModelTags: jest.fn(),
}))
jest.mock('@/features/pack/api/packApi', () => ({
  addModelToPack: jest.fn(),
  removeModelFromPack: jest.fn(),
}))
jest.mock('@/features/project/api/projectApi', () => ({
  addModelToProject: jest.fn(),
  removeModelFromProject: jest.fn(),
}))
jest.mock('@/features/recycled-files/api/recycledApi', () => ({
  restoreEntity: jest.fn().mockResolvedValue(undefined),
}))

const { softDeleteModel, updateModelTags } = jest.requireMock(
  '@/features/models/api/modelApi'
) as {
  softDeleteModel: jest.Mock
  updateModelTags: jest.Mock
}
const { restoreEntity } = jest.requireMock(
  '@/features/recycled-files/api/recycledApi'
) as { restoreEntity: jest.Mock }

describe('ModelContextMenu recycle', () => {
  it('offers Undo in the toast and restores the recycled model', async () => {
    const user = userEvent.setup()
    const ref = createRef<ModelContextMenuHandle>()
    renderWithProviders(<ModelContextMenu ref={ref} />)

    const model = { id: '5', name: 'Chair', tags: [] } as never
    act(() => {
      ref.current?.show(
        new MouseEvent('contextmenu', { bubbles: true }) as never,
        { models: [model], mode: 'single' }
      )
    })

    await user.click(await screen.findByText('Recycle'))
    await waitFor(() => expect(softDeleteModel).toHaveBeenCalledWith(5))

    // The success toast carries an Undo affordance; pressing it restores the
    // model from the recycle bin instead of leaving the user to find it.
    await user.click(await screen.findByTestId('recycle-undo'))
    await waitFor(() => expect(restoreEntity).toHaveBeenCalledWith('model', 5))
    expect(updateModelTags).not.toHaveBeenCalled()
  })
})
