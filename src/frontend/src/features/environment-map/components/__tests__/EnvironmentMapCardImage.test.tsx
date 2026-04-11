import { act, render, screen } from '@testing-library/react'

import { EnvironmentMapCardImage } from '@/features/environment-map/components/EnvironmentMapCardImage'

describe('EnvironmentMapCardImage', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders an image with the provided src and alt', () => {
    render(
      <EnvironmentMapCardImage
        src="http://localhost:8080/thumbnails/1.jpg"
        alt="Studio HDRI"
      />
    )

    const image = screen.getByTestId('environment-map-card-thumbnail')
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/thumbnails/1.jpg'
    )
    expect(image).toHaveAttribute('alt', 'Studio HDRI')
  })

  it('appends a retry query parameter after an image load error', () => {
    render(
      <EnvironmentMapCardImage
        src="http://localhost:8080/thumbnails/1.jpg"
        alt="Studio HDRI"
      />
    )

    const image = screen.getByTestId('environment-map-card-thumbnail')

    // Simulate image load error
    act(() => {
      image.dispatchEvent(new Event('error'))
    })

    // Advance past the retry delay (3000ms)
    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/thumbnails/1.jpg?thumbnailRetry=1'
    )
  })

  it('preserves existing query parameters when appending retry param', () => {
    render(
      <EnvironmentMapCardImage
        src="http://localhost:8080/thumbnails/1.jpg?t=123"
        alt="Studio HDRI"
      />
    )

    const image = screen.getByTestId('environment-map-card-thumbnail')

    act(() => {
      image.dispatchEvent(new Event('error'))
    })

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/thumbnails/1.jpg?t=123&thumbnailRetry=1'
    )
  })

  it('does not retry before the delay elapses', () => {
    render(
      <EnvironmentMapCardImage
        src="http://localhost:8080/thumbnails/1.jpg"
        alt="Studio HDRI"
      />
    )

    const image = screen.getByTestId('environment-map-card-thumbnail')

    act(() => {
      image.dispatchEvent(new Event('error'))
    })

    // Advance less than the retry delay
    act(() => {
      jest.advanceTimersByTime(2000)
    })

    // Should still have the original src
    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/thumbnails/1.jpg'
    )
  })

  it('increments the retry counter on successive errors', () => {
    render(
      <EnvironmentMapCardImage
        src="http://localhost:8080/thumbnails/1.jpg"
        alt="Studio HDRI"
      />
    )

    const image = screen.getByTestId('environment-map-card-thumbnail')

    // First error + retry
    act(() => {
      image.dispatchEvent(new Event('error'))
    })
    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/thumbnails/1.jpg?thumbnailRetry=1'
    )

    // Second error + retry
    act(() => {
      image.dispatchEvent(new Event('error'))
    })
    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/thumbnails/1.jpg?thumbnailRetry=2'
    )
  })

  it('stops retrying after a successful load', () => {
    render(
      <EnvironmentMapCardImage
        src="http://localhost:8080/thumbnails/1.jpg"
        alt="Studio HDRI"
      />
    )

    const image = screen.getByTestId('environment-map-card-thumbnail')

    // Trigger error to start retry
    act(() => {
      image.dispatchEvent(new Event('error'))
    })

    // Simulate successful load before the retry fires
    act(() => {
      image.dispatchEvent(new Event('load'))
    })

    // Advance past the retry delay
    act(() => {
      jest.advanceTimersByTime(5000)
    })

    // Src should remain unchanged (no retry param appended)
    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/thumbnails/1.jpg'
    )
  })

  it('resets retry state when src changes', () => {
    const { rerender } = render(
      <EnvironmentMapCardImage
        src="http://localhost:8080/thumbnails/1.jpg"
        alt="Studio HDRI"
      />
    )

    const image = screen.getByTestId('environment-map-card-thumbnail')

    // Trigger error and retry
    act(() => {
      image.dispatchEvent(new Event('error'))
    })
    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/thumbnails/1.jpg?thumbnailRetry=1'
    )

    // Re-render with new src
    rerender(
      <EnvironmentMapCardImage
        src="http://localhost:8080/thumbnails/2.jpg"
        alt="Studio HDRI"
      />
    )

    // Should reset to the new src without retry param
    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/thumbnails/2.jpg'
    )
  })
})
