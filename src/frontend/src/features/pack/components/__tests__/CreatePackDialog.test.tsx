import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CreatePackDialog } from '@/features/pack/components/CreatePackDialog'
import { renderWithProviders } from '@/test/renderWithProviders'

jest.mock('@/features/pack/api/packApi', () => ({
  createPack: jest.fn().mockResolvedValue(undefined),
}))

describe('CreatePackDialog validation', () => {
  // Regression: an empty name only produced a transient toast (or nothing),
  // while the field itself stayed unmarked, so the form looked broken.
  it('marks the name field with an inline reason when it is empty', async () => {
    renderWithProviders(<CreatePackDialog visible onHide={jest.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByTestId('pack-name-error')).toHaveTextContent(
      'Pack name is required'
    )
  })
})
