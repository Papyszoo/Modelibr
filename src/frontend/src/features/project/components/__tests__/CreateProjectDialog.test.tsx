import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/renderWithProviders'

import { CreateProjectDialog } from '../CreateProjectDialog'

jest.mock('@/features/project/api/projectApi', () => ({
  createProject: jest.fn(),
}))

// Regression: an empty project name disabled nothing and explained nothing -
// the only feedback was a toast after submitting. It now shows inline.
describe('CreateProjectDialog validation', () => {
  it('shows an inline error when the name is cleared', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <CreateProjectDialog visible onHide={() => undefined} />
    )

    const name = screen.getByLabelText('Name *')
    await user.type(name, 'a')
    await user.clear(name)

    await waitFor(() =>
      expect(screen.getByTestId('project-name-error')).toHaveTextContent(
        'Project name is required'
      )
    )
    expect(name).toHaveAttribute('aria-invalid', 'true')
  })
})
