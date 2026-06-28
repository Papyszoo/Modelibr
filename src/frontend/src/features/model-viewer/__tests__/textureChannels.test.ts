import { TextureChannel, TextureType } from '@/types'

import {
  CHANNEL_EXTRACT_FRAGMENT_SHADER,
  CHANNEL_VERTEX_SHADER,
  channelNeedsExtraction,
  getChannelUniformIndex,
  MATERIAL_SLOT_BY_TEXTURE_TYPE,
  resolveMaterialSlot,
  RGB_INVERT_FRAGMENT_SHADER,
  slotIsColorData,
  TEXTURE_TYPE,
  textureTypeNeedsInvert,
} from '../../../../../asset-processor/lib/textureChannels.js'

/**
 * Locks the shared texture-type → material-slot map and channel-extraction
 * contract that the frontend viewer and the worker thumbnail both consume.
 *
 * Two real drifts this guards against:
 *  - the worker slot map had no Glossiness entry, so a Glossiness map (inverted
 *    roughness) was silently dropped in the thumbnail while the viewer applied
 *    it as an inverted roughnessMap;
 *  - the two channel-extraction shaders used different channel numbering
 *    (frontend 0-based `uChannel`, worker 1-based `channel`).
 */
describe('shared TextureType enum mirror', () => {
  // If the API enum (Domain/ValueObjects/TextureType.cs, mirrored in the
  // frontend TextureType) ever renumbers, this fails instead of silently
  // mis-routing textures across runtimes.
  it('matches the frontend TextureType enum value-for-value', () => {
    expect(TEXTURE_TYPE.Albedo).toBe(TextureType.Albedo)
    expect(TEXTURE_TYPE.Normal).toBe(TextureType.Normal)
    expect(TEXTURE_TYPE.Height).toBe(TextureType.Height)
    expect(TEXTURE_TYPE.AO).toBe(TextureType.AO)
    expect(TEXTURE_TYPE.Roughness).toBe(TextureType.Roughness)
    expect(TEXTURE_TYPE.Metallic).toBe(TextureType.Metallic)
    expect(TEXTURE_TYPE.Specular).toBe(TextureType.Specular)
    expect(TEXTURE_TYPE.Emissive).toBe(TextureType.Emissive)
    expect(TEXTURE_TYPE.Bump).toBe(TextureType.Bump)
    expect(TEXTURE_TYPE.Alpha).toBe(TextureType.Alpha)
    expect(TEXTURE_TYPE.Displacement).toBe(TextureType.Displacement)
    expect(TEXTURE_TYPE.Glossiness).toBe(TextureType.Glossiness)
  })
})

describe('MATERIAL_SLOT_BY_TEXTURE_TYPE / resolveMaterialSlot', () => {
  it('routes each texture type to the expected MeshPhysicalMaterial slot', () => {
    expect(resolveMaterialSlot(TextureType.Albedo)).toBe('map')
    expect(resolveMaterialSlot(TextureType.Normal)).toBe('normalMap')
    expect(resolveMaterialSlot(TextureType.AO)).toBe('aoMap')
    expect(resolveMaterialSlot(TextureType.Roughness)).toBe('roughnessMap')
    expect(resolveMaterialSlot(TextureType.Metallic)).toBe('metalnessMap')
    expect(resolveMaterialSlot(TextureType.Specular)).toBe('specularColorMap')
    expect(resolveMaterialSlot(TextureType.Emissive)).toBe('emissiveMap')
    expect(resolveMaterialSlot(TextureType.Bump)).toBe('bumpMap')
    expect(resolveMaterialSlot(TextureType.Alpha)).toBe('alphaMap')
  })

  it('feeds both Height and Displacement into displacementMap', () => {
    expect(resolveMaterialSlot(TextureType.Height)).toBe('displacementMap')
    expect(resolveMaterialSlot(TextureType.Displacement)).toBe(
      'displacementMap'
    )
  })

  it('feeds both Roughness and Glossiness into roughnessMap (the dropped-glossiness drift)', () => {
    expect(resolveMaterialSlot(TextureType.Roughness)).toBe('roughnessMap')
    expect(resolveMaterialSlot(TextureType.Glossiness)).toBe('roughnessMap')
  })

  it('has no slot for the SplitChannel source placeholder or unknown types', () => {
    expect(resolveMaterialSlot(TextureType.SplitChannel)).toBeNull()
    expect(resolveMaterialSlot(999)).toBeNull()
  })
})

describe('textureTypeNeedsInvert', () => {
  it('inverts Glossiness (it is inverted roughness) and nothing else', () => {
    expect(textureTypeNeedsInvert(TextureType.Glossiness)).toBe(true)
    expect(textureTypeNeedsInvert(TextureType.Roughness)).toBe(false)
    expect(textureTypeNeedsInvert(TextureType.Albedo)).toBe(false)
    expect(textureTypeNeedsInvert(TextureType.Height)).toBe(false)
  })
})

describe('slotIsColorData', () => {
  it('treats only the color slots as sRGB; data maps stay linear', () => {
    expect(slotIsColorData('map')).toBe(true)
    expect(slotIsColorData('emissiveMap')).toBe(true)
    expect(slotIsColorData('specularColorMap')).toBe(true)
    expect(slotIsColorData('normalMap')).toBe(false)
    expect(slotIsColorData('roughnessMap')).toBe(false)
    expect(slotIsColorData('aoMap')).toBe(false)
    expect(slotIsColorData('displacementMap')).toBe(false)
  })
})

describe('getChannelUniformIndex', () => {
  it('maps the TextureChannel enum to the 0-based shader index', () => {
    expect(getChannelUniformIndex(TextureChannel.R)).toBe(0)
    expect(getChannelUniformIndex(TextureChannel.G)).toBe(1)
    expect(getChannelUniformIndex(TextureChannel.B)).toBe(2)
    expect(getChannelUniformIndex(TextureChannel.A)).toBe(3)
  })

  it('falls back to 0 for RGB / non-channel values (the caller should not extract)', () => {
    expect(getChannelUniformIndex(TextureChannel.RGB)).toBe(0)
    expect(getChannelUniformIndex(0)).toBe(0)
  })
})

describe('channelNeedsExtraction', () => {
  it('is true only for the single channels R/G/B/A', () => {
    expect(channelNeedsExtraction(TextureChannel.R)).toBe(true)
    expect(channelNeedsExtraction(TextureChannel.G)).toBe(true)
    expect(channelNeedsExtraction(TextureChannel.B)).toBe(true)
    expect(channelNeedsExtraction(TextureChannel.A)).toBe(true)
  })

  it('is false for RGB and the legacy 0 (no extraction)', () => {
    expect(channelNeedsExtraction(TextureChannel.RGB)).toBe(false)
    expect(channelNeedsExtraction(0)).toBe(false)
  })
})

describe('channel-extraction shaders', () => {
  // The frontend hook and the worker page.evaluate bind these exact uniform
  // names; a rename here without updating both call sites would silently break
  // extraction, so pin the contract.
  it('the extraction fragment shader exposes uTexture / uChannel / uInvert', () => {
    expect(CHANNEL_EXTRACT_FRAGMENT_SHADER).toContain(
      'uniform sampler2D uTexture'
    )
    expect(CHANNEL_EXTRACT_FRAGMENT_SHADER).toContain('uniform int uChannel')
    expect(CHANNEL_EXTRACT_FRAGMENT_SHADER).toContain('uniform int uInvert')
  })

  it('the RGB-invert fragment shader inverts rgb and keeps alpha', () => {
    expect(RGB_INVERT_FRAGMENT_SHADER).toContain('1.0 - texColor.rgb')
  })

  it('the vertex shader is a fullscreen-quad passthrough (camera-independent)', () => {
    expect(CHANNEL_VERTEX_SHADER).toContain('gl_Position = vec4(position, 1.0)')
    expect(CHANNEL_VERTEX_SHADER).toContain('vUv = uv')
  })

  it('keeps the slot map frozen against accidental mutation', () => {
    expect(Object.isFrozen(MATERIAL_SLOT_BY_TEXTURE_TYPE)).toBe(true)
  })
})
