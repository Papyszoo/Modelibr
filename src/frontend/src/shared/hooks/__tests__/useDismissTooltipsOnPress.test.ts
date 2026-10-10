import { renderHook } from '@testing-library/react'

import { useDismissTooltipsOnPress } from '../useDismissTooltipsOnPress'

/*
  Regression: a PrimeReact tooltip hides on `mouseleave`, which never fires when
  a button is clicked and the pointer stays put - the tooltip froze on screen.
  A capture-phase pointerdown must dismiss the pressed tooltip target.
*/
describe('useDismissTooltipsOnPress', () => {
  it('fires mouseleave on the tooltip target when it is pressed', () => {
    renderHook(() => useDismissTooltipsOnPress())

    const target = document.createElement('button')
    target.setAttribute('data-pr-tooltip', 'Display options')
    document.body.appendChild(target)
    const onMouseLeave = jest.fn()
    target.addEventListener('mouseleave', onMouseLeave)

    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

    expect(onMouseLeave).toHaveBeenCalledTimes(1)
    target.remove()
  })

  it('ignores presses outside any tooltip target', () => {
    renderHook(() => useDismissTooltipsOnPress())

    const other = document.createElement('button')
    document.body.appendChild(other)
    const onMouseLeave = jest.fn()
    other.addEventListener('mouseleave', onMouseLeave)

    other.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

    expect(onMouseLeave).not.toHaveBeenCalled()
    other.remove()
  })
})
