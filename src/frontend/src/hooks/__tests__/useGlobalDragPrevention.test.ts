import { renderHook } from '@testing-library/react'
import { useGlobalDragPrevention } from '@/hooks/useGlobalDragPrevention'

// Mock window event listener methods
const addEventListenerSpy = jest.spyOn(window, 'addEventListener')
const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener')

describe('useGlobalDragPrevention', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    addEventListenerSpy.mockClear()
    removeEventListenerSpy.mockClear()
  })

  afterAll(() => {
    // Restore original methods after all tests
    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })

  it('should add dragover and drop event listeners on mount', () => {
    renderHook(() => useGlobalDragPrevention())

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'dragover',
      expect.any(Function),
      false
    )
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'drop',
      expect.any(Function),
      false
    )
    expect(addEventListenerSpy).toHaveBeenCalledTimes(2)
  })

  it('should remove event listeners on unmount', () => {
    const { unmount } = renderHook(() => useGlobalDragPrevention())

    // Verify listeners were added
    expect(addEventListenerSpy).toHaveBeenCalledTimes(2)

    // Unmount the hook
    unmount()

    // Verify listeners were removed
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'dragover',
      expect.any(Function),
      false
    )
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'drop',
      expect.any(Function),
      false
    )
    expect(removeEventListenerSpy).toHaveBeenCalledTimes(2)
  })

  it('should prevent default behavior on dragover events', () => {
    renderHook(() => useGlobalDragPrevention())

    // Get the dragover handler that was registered
    const dragoverHandler = addEventListenerSpy.mock.calls.find(
      call => call[0] === 'dragover'
    )?.[1] as EventListener

    expect(dragoverHandler).toBeDefined()

    // Create a mock dragover event
    const mockEvent = {
      preventDefault: jest.fn(),
    } as unknown as DragEvent

    // Call the handler
    dragoverHandler(mockEvent)

    // Verify preventDefault was called
    expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('should prevent default behavior on drop events', () => {
    renderHook(() => useGlobalDragPrevention())

    // Get the drop handler that was registered
    const dropHandler = addEventListenerSpy.mock.calls.find(
      call => call[0] === 'drop'
    )?.[1] as EventListener

    expect(dropHandler).toBeDefined()

    // Create a mock drop event
    const mockEvent = {
      preventDefault: jest.fn(),
    } as unknown as DragEvent

    // Call the handler
    dropHandler(mockEvent)

    // Verify preventDefault was called
    expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('should handle multiple hook instances correctly', () => {
    // Render multiple instances of the hook
    const hook1 = renderHook(() => useGlobalDragPrevention())
    const hook2 = renderHook(() => useGlobalDragPrevention())

    // Each instance should add its own listeners
    expect(addEventListenerSpy).toHaveBeenCalledTimes(4) // 2 events × 2 instances

    // Unmount one instance
    hook1.unmount()

    // Only that instance's listeners should be removed
    expect(removeEventListenerSpy).toHaveBeenCalledTimes(2)

    // Unmount the second instance
    hook2.unmount()

    // All listeners should now be removed
    expect(removeEventListenerSpy).toHaveBeenCalledTimes(4)
  })
})
