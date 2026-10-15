import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CreateTextureSetDialog } from '@/features/texture-set/dialogs/CreateTextureSetDialog'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('CreateTextureSetDialog name validation', () => {
  // Regression: the Create button only required a non-empty name, so a single
  // character passed while the caption promised 2-200 characters - the dialog
  // created a set the schema itself rejects.
  it('keeps Create disabled and shows the reason for a 1-character name', async () => {
    renderWithProviders(
      <CreateTextureSetDialog
        visible
        onHide={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />
    )

    await userEvent.type(screen.getByLabelText(/name/i), 'a')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'at least 2 characters'
    )
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('enables Create once the name is long enough', async () => {
    renderWithProviders(
      <CreateTextureSetDialog
        visible
        onHide={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />
    )

    await userEvent.type(screen.getByLabelText(/name/i), 'ab')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })
})
