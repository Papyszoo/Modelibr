import { describe, it, expect, vi } from 'vitest'

import { ThumbnailProcessor } from '../processors/thumbnailProcessor.js'

// Silence the processor's logger
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

// web_bake.inspect()'s counts as export_glb.py prints them for the committed
// rig fixture: two constraints (one IK), a driven shape key and an Array
// modifier on the shape-keyed mesh.
const REPORT = {
  objectConstraints: 1,
  boneConstraints: 1,
  ikConstraints: 1,
  objectDrivers: 0,
  armatureDrivers: 0,
  shapeKeyDrivers: 1,
  shapeKeyActions: 1,
  droppedModifiers: ['Morph:Array (ARRAY)'],
  hasRigFeatures: true,
}

// parseRigReport/attachUnbakedRigReport use no instance state; skip the
// constructor so the test does not build a renderer pool and API clients it
// will never touch.
const processor = Object.create(ThumbnailProcessor.prototype)

describe('ThumbnailProcessor.parseRigReport', () => {
  it('reads web_bake.inspect() output from the Blender stdout', () => {
    const stdout = [
      'export_glb: Blender 5.2.2, target /tmp/model.glb',
      `EXPORT_GLB_REPORT: ${JSON.stringify(REPORT)}`,
      'GLB exported to: /tmp/model.glb (1234 bytes)',
    ].join('\n')

    expect(processor.parseRigReport(stdout)).toEqual(REPORT)
  })

  it('returns null when the export printed no report', () => {
    // A non-.blend source, or an older script: nothing to say.
    expect(
      processor.parseRigReport('GLB exported to: /tmp/model.glb (1 bytes)')
    ).toBeNull()
    expect(processor.parseRigReport('')).toBeNull()
    expect(processor.parseRigReport(undefined)).toBeNull()
  })

  it('returns null for a malformed report instead of throwing', () => {
    expect(processor.parseRigReport('EXPORT_GLB_REPORT: {oops')).toBeNull()
  })
})

describe('ThumbnailProcessor.attachUnbakedRigReport', () => {
  it('puts the counts under rollups.unbakedRig and adds the warning line', () => {
    const sceneGraph = { rollups: { meshCount: 2 }, warnings: [] }

    const attached = processor.attachUnbakedRigReport(sceneGraph, REPORT)

    expect(attached).toBe(true)
    expect(sceneGraph.rollups.unbakedRig).toEqual(REPORT)
    expect(sceneGraph.warnings).toHaveLength(1)
    // The counts in plain language, so the viewer has a sentence to show beside
    // the "Bake for web" button.
    const warning = sceneGraph.warnings[0]
    expect(warning).toContain('2 constraints')
    expect(warning).toContain('1 driver')
    expect(warning).toContain('1 shape-key animation')
    expect(warning).toContain('1 modifier glTF would drop')
    expect(warning).toContain('Bake for web')
  })

  it('leaves a scene graph with nothing to report untouched', () => {
    const sceneGraph = { rollups: { meshCount: 2 } }

    expect(
      processor.attachUnbakedRigReport(sceneGraph, {
        ...REPORT,
        hasRigFeatures: false,
      })
    ).toBe(false)
    expect(sceneGraph.rollups.unbakedRig).toBeUndefined()
    expect(sceneGraph.warnings).toBeUndefined()
  })

  it('ignores a report whose inspection failed', () => {
    const sceneGraph = { rollups: {}, warnings: [] }

    expect(
      processor.attachUnbakedRigReport(sceneGraph, {
        error: 'Rig inspection failed: boom',
      })
    ).toBe(false)
    expect(sceneGraph.rollups.unbakedRig).toBeUndefined()
    expect(sceneGraph.warnings).toEqual([])
  })
})
