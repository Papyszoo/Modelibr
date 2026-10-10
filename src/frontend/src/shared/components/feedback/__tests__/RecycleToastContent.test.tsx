import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { recycleToastContent } from '../RecycleToastContent'

describe('recycleToastContent', () => {
  // Regression: a Recycle success toast with no way back. Every recycle path
  // shares this body, so the Undo action has to reach the caller's restore
  // handler - not just render a dead button.
  it('renders the message and calls onUndo from the Undo action', async () => {
    const onUndo = jest.fn()
    render(
      <div>
        {recycleToastContent('3 sounds moved to recycled files', onUndo)}
      </div>
    )

    expect(
      screen.getByText('3 sounds moved to recycled files')
    ).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('recycle-undo'))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })
})
