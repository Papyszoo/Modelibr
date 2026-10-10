import { visibleBounds } from '@/components/layout/trimThumbnail'

const rgba = (width: number, height: number, opaque: [number, number][]) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255
  return data
}

describe('visibleBounds', () => {
  // Model renders sit off-centre in wide transparent padding; the dock tab
  // centres the model on these bounds, so a wrong edge shifts the thumbnail.
  it('bounds exactly the visible pixels, end-exclusive', () => {
    const data = rgba(8, 8, [
      [1, 5],
      [3, 2],
      [4, 6],
    ])
    expect(visibleBounds(data, 8, 8)).toEqual({
      left: 1,
      top: 2,
      right: 5,
      bottom: 7,
    })
  })

  it('ignores near-transparent anti-aliasing and reports an empty image', () => {
    const data = rgba(4, 4, [])
    data[3] = 5
    expect(visibleBounds(data, 4, 4)).toBeNull()
  })
})
