import { boundsOffset } from '../sceneGeometry'

/**
 * Where the viewport draws an asset's box relative to the node's origin.
 *
 * Shared by the selection outline and blockout mode, and this is the regression
 * that makes it worth sharing: reading a *missing* convention label as
 * "centered" is what once drew every box half a height below its asset. Nearly
 * half the real library has an origin that matches none of the three labels, so
 * the measured fraction has to win wherever it exists.
 */
const SOFA = { x: 2, y: 0.8, z: 1 }

describe('boundsOffset', () => {
  it('measures from the origin fraction when there is one', () => {
    // Base at the origin, off-centre in Z - the GlamVelvetSofa case, whose
    // convention label is null precisely because it fits none of them.
    const [x, y, z] = boundsOffset(SOFA, null, { x: 0.5, y: 0, z: 0.614 })
    expect(x).toBe(0)
    expect(y).toBe(0.4)
    expect(z).toBeCloseTo(-0.114, 6)
  })

  it('prefers the measured fraction over a disagreeing label', () => {
    // Both present: the label is a lossy summary of the fraction, and the
    // server resolves the same conflict the same way.
    expect(boundsOffset(SOFA, 'centered', { x: 0.5, y: 0, z: 0.5 })).toEqual([
      0, 0.4, 0,
    ])
  })

  it('falls back to the label when nothing was measured', () => {
    expect(boundsOffset(SOFA, 'bottom-center', null)).toEqual([0, 0.4, 0])
    expect(boundsOffset(SOFA, 'corner', null)).toEqual([1, 0.4, 0.5])
  })

  it('treats an unknown origin as centered, and only then', () => {
    // The one case where "centered" is a guess rather than a reading. It stays
    // the fallback because a box drawn at the node's own position is at least
    // where the node is.
    expect(boundsOffset(SOFA, null, null)).toEqual([0, 0, 0])
  })
})
