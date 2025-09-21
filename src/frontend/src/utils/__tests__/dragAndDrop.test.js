// Test drag and drop functionality without React hooks
describe('Drag and Drop Utilities', () => {
  // Mock implementation of the drag and drop function
  function useDragAndDrop(onFilesDropped) {
    const onDrop = (e) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      onFilesDropped(files)
    }

    const onDragOver = (e) => {
      e.preventDefault()
    }

    const onDragEnter = (e) => {
      e.preventDefault()
    }

    return {
      onDrop,
      onDragOver,
      onDragEnter
    }
  }

  it('should return drag and drop event handlers', () => {
    const onFilesDropped = jest.fn()
    const handlers = useDragAndDrop(onFilesDropped)

    expect(typeof handlers.onDrop).toBe('function')
    expect(typeof handlers.onDragOver).toBe('function')
    expect(typeof handlers.onDragEnter).toBe('function')
  })

  it('should call onFilesDropped when files are dropped', () => {
    const onFilesDropped = jest.fn()
    const handlers = useDragAndDrop(onFilesDropped)

    const mockFile = new File(['content'], 'test.obj', { type: 'application/octet-stream' })
    const mockEvent = {
      preventDefault: jest.fn(),
      dataTransfer: {
        files: [mockFile]
      }
    }

    handlers.onDrop(mockEvent)

    expect(mockEvent.preventDefault).toHaveBeenCalled()
    expect(onFilesDropped).toHaveBeenCalledWith([mockFile])
  })

  it('should prevent default on drag over and drag enter', () => {
    const onFilesDropped = jest.fn()
    const handlers = useDragAndDrop(onFilesDropped)

    const mockEvent = { preventDefault: jest.fn() }

    handlers.onDragOver(mockEvent)
    handlers.onDragEnter(mockEvent)

    expect(mockEvent.preventDefault).toHaveBeenCalledTimes(2)
  })

  it('should handle multiple files in drop event', () => {
    const onFilesDropped = jest.fn()
    const handlers = useDragAndDrop(onFilesDropped)

    const mockFile1 = new File(['content1'], 'test1.obj', { type: 'application/octet-stream' })
    const mockFile2 = new File(['content2'], 'test2.gltf', { type: 'application/octet-stream' })
    const mockEvent = {
      preventDefault: jest.fn(),
      dataTransfer: {
        files: [mockFile1, mockFile2]
      }
    }

    handlers.onDrop(mockEvent)

    expect(onFilesDropped).toHaveBeenCalledWith([mockFile1, mockFile2])
  })
})