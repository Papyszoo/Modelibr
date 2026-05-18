import { createCylinderGeometry } from '../createPreviewGeometry'

describe('createCylinderGeometry', () => {
  it('keeps the side rim radial and cap rim vertical (no 45° averaging)', () => {
    // Regression test for the rim-flare bug: when aDispNormal is computed
    // *after* merging the side + cap pieces, the rim vertices average into
    // a 45° outward-and-up direction and flare under displacement. The fix
    // computes aDispNormal per piece *before* mergeGeometries, so the side
    // rim keeps its purely-radial direction and the cap rim keeps its
    // purely-vertical direction.
    const geom = createCylinderGeometry()
    const pos = geom.getAttribute('position')
    const disp = geom.getAttribute('aDispNormal')
    expect(disp).toBeDefined()

    // Find aDispNormal values for any vertex at the top rim — strictly
    // y = 1 and x² + z² ≈ 1.
    const radialCount = { radial: 0, vertical: 0, fortyFive: 0 }
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      if (Math.abs(y - 1) > 1e-3) continue
      if (Math.abs(x * x + z * z - 1) > 1e-3) continue

      const ny = disp.getY(i)
      const nh = Math.hypot(disp.getX(i), disp.getZ(i)) // horizontal mag
      if (ny > 0.95) radialCount.vertical++
      else if (ny < 0.05 && nh > 0.95) radialCount.radial++
      else radialCount.fortyFive++
    }

    expect(radialCount.radial).toBeGreaterThan(0)
    expect(radialCount.vertical).toBeGreaterThan(0)
    expect(radialCount.fortyFive).toBe(0)
  })

  it('contains a uv2 attribute for AO sampling', () => {
    const geom = createCylinderGeometry()
    expect(geom.getAttribute('uv2')).toBeDefined()
    expect(geom.getAttribute('uv2').count).toBe(geom.getAttribute('uv').count)
  })

  it('preserves the cylinder bounding box', () => {
    const geom = createCylinderGeometry()
    geom.computeBoundingBox()
    const bb = geom.boundingBox!
    expect(bb.min.y).toBeCloseTo(-1, 3)
    expect(bb.max.y).toBeCloseTo(1, 3)
    expect(bb.max.x).toBeCloseTo(1, 3)
    expect(bb.min.x).toBeCloseTo(-1, 3)
  })
})
