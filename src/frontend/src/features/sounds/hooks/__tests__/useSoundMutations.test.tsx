import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactElement } from 'react'

import { restoreEntity } from '@/features/recycled-files/api/recycledApi'
import { softDeleteSound } from '@/features/sounds/api/soundApi'
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/renderWithProviders'

import { useSoundMutations } from '../useSoundMutations'

jest.mock('@/features/sounds/api/soundApi', () => ({
  createSoundCategory: jest.fn(),
  deleteSoundCategory: jest.fn(),
  softDeleteSound: jest.fn().mockResolvedValue(undefined),
  updateSound: jest.fn(),
  updateSoundCategory: jest.fn(),
}))
jest.mock('@/features/recycled-files/api/recycledApi', () => ({
  restoreEntity: jest.fn().mockResolvedValue(undefined),
}))

const softDelete = softDeleteSound as jest.Mock
const restore = restoreEntity as jest.Mock

describe('useSoundMutations recycle Undo', () => {
  // Regression: the recycle toast had no way back, so a mis-click sent sounds to
  // the bin with the user left to find the Recycled Files tab themselves.
  it('offers an Undo that restores the recycled sounds', async () => {
    const showToast = jest.fn()
    const loadSounds = jest.fn().mockResolvedValue(undefined)
    const { result } = renderHook(
      () =>
        useSoundMutations({
          showToast,
          loadSounds,
          loadCategories: jest.fn().mockResolvedValue(undefined),
          activeCategoryId: null,
          setActiveCategoryId: jest.fn(),
          categories: [],
          setSelectedSoundIds: jest.fn(),
          setContextMenuTarget: jest.fn(),
        }),
      { wrapper: createQueryWrapper(createTestQueryClient()) }
    )

    await act(async () => {
      await result.current.recycleSoundsMutation.mutateAsync([5, 6])
    })

    await waitFor(() => expect(softDelete).toHaveBeenCalledTimes(2))
    const recycleCall = showToast.mock.calls.find(
      call => call[0].summary === 'Recycled'
    )
    expect(recycleCall).toBeTruthy()
    const content = recycleCall?.[0].content as () => ReactElement
    expect(content).toBeDefined()

    render(<div>{content()}</div>)
    await userEvent.click(screen.getByTestId('recycle-undo'))

    await waitFor(() => expect(restore).toHaveBeenCalledWith('sound', 5))
    expect(restore).toHaveBeenCalledWith('sound', 6)
  })
})
