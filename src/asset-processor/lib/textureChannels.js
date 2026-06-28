/**
 * Shared texture-type → material-slot map and channel-extraction shaders. Single
 * source of truth for the *data* (which MeshPhysicalMaterial slot a texture type
 * feeds, which types invert, which slots carry sRGB color) and the GLSL that
 * extracts a single R/G/B/A channel to grayscale.
 *
 * These were hand-duplicated across the three runtimes that must agree:
 *   - the frontend viewer (`useChannelExtractedTextures.ts` + `TexturedModel`'s
 *     `TEXTURE_SLOTS`),
 *   - the worker thumbnail render (`puppeteerRenderer.js` applyTextures, which
 *     reaches this through the `window.modelibrTextureChannels` side-effect),
 *   - demo mode (which uses the enum constants).
 *
 * The duplication had already drifted: the two channel-extraction shaders used
 * different channel numbering (frontend 0-based `uChannel`, worker 1-based
 * `channel`), and the worker's slot map had no Glossiness entry at all — so a
 * Glossiness map (inverted roughness) was silently dropped in the thumbnail
 * while the viewer applied it as an inverted roughnessMap. Both are fixed by
 * sharing the map + shaders here.
 *
 * No THREE import — the maps are plain data, the shaders are strings, and the
 * channel index is arithmetic. Each runtime keeps its own render-to-target
 * orchestration (render-target size, camera, clone/dispose, color-space
 * assignment); only the data and the GLSL live here.
 */

/**
 * TextureType enum — mirrors `Domain/ValueObjects/TextureType.cs` (the API
 * serializes the enum as its numeric value). Kept here so all three runtimes
 * name the same numbers instead of sprinkling magic literals.
 * @type {Readonly<Record<string, number>>}
 */
export const TEXTURE_TYPE = Object.freeze({
  SplitChannel: 0,
  Albedo: 1,
  Normal: 2,
  Height: 3,
  AO: 4,
  Roughness: 5,
  Metallic: 6,
  Specular: 8,
  Emissive: 9,
  Bump: 10,
  Alpha: 11,
  Displacement: 12,
  Glossiness: 13,
})

/**
 * TextureChannel enum — mirrors `Domain/ValueObjects/TextureChannel.cs`. RGB
 * means "use the whole texture, no channel extraction".
 * @type {Readonly<Record<string, number>>}
 */
export const TEXTURE_CHANNEL = Object.freeze({
  R: 1,
  G: 2,
  B: 3,
  A: 4,
  RGB: 5,
})

/**
 * Canonical texture type → MeshPhysicalMaterial slot. Both Height and
 * Displacement feed `displacementMap`; both Roughness and Glossiness feed
 * `roughnessMap` (Glossiness inverted, see {@link INVERTED_TEXTURE_TYPES}).
 * SplitChannel (0) is a source-only placeholder and has no slot.
 * @type {Readonly<Record<number, string>>}
 */
export const MATERIAL_SLOT_BY_TEXTURE_TYPE = Object.freeze({
  [TEXTURE_TYPE.Albedo]: 'map',
  [TEXTURE_TYPE.Normal]: 'normalMap',
  [TEXTURE_TYPE.Height]: 'displacementMap',
  [TEXTURE_TYPE.AO]: 'aoMap',
  [TEXTURE_TYPE.Roughness]: 'roughnessMap',
  [TEXTURE_TYPE.Metallic]: 'metalnessMap',
  [TEXTURE_TYPE.Specular]: 'specularColorMap',
  [TEXTURE_TYPE.Emissive]: 'emissiveMap',
  [TEXTURE_TYPE.Bump]: 'bumpMap',
  [TEXTURE_TYPE.Alpha]: 'alphaMap',
  [TEXTURE_TYPE.Displacement]: 'displacementMap',
  [TEXTURE_TYPE.Glossiness]: 'roughnessMap',
})

/**
 * Texture types whose values must be inverted at load. Glossiness is inverted
 * roughness (gloss = 1 - rough), so it feeds `roughnessMap` flipped.
 * @type {ReadonlySet<number>}
 */
export const INVERTED_TEXTURE_TYPES = Object.freeze(
  new Set([TEXTURE_TYPE.Glossiness])
)

/**
 * Material slots that carry sRGB *color* data; everything else is linear data
 * (normals, roughness, AO, height…). Used to pick the texture color space.
 * @type {ReadonlySet<string>}
 */
export const COLOR_MATERIAL_SLOTS = Object.freeze(
  new Set(['map', 'emissiveMap', 'specularColorMap'])
)

/**
 * Resolve the MeshPhysicalMaterial slot a texture type feeds, or null if the
 * type has no slot (e.g. SplitChannel).
 * @param {number} textureType
 * @returns {string | null}
 */
export function resolveMaterialSlot(textureType) {
  return MATERIAL_SLOT_BY_TEXTURE_TYPE[textureType] ?? null
}

/**
 * Whether a texture type's values must be inverted at load (Glossiness).
 * @param {number} textureType
 * @returns {boolean}
 */
export function textureTypeNeedsInvert(textureType) {
  return INVERTED_TEXTURE_TYPES.has(textureType)
}

/**
 * Whether a material slot carries sRGB color data (vs linear data).
 * @param {string} slot
 * @returns {boolean}
 */
export function slotIsColorData(slot) {
  return COLOR_MATERIAL_SLOTS.has(slot)
}

/**
 * Map a TextureChannel enum value to the 0-based index the extraction fragment
 * shader's `uChannel` uniform expects (R=0, G=1, B=2, A=3). RGB / anything else
 * falls back to 0 (the caller shouldn't extract a channel for RGB sources).
 * @param {number} channel
 * @returns {number}
 */
export function getChannelUniformIndex(channel) {
  switch (channel) {
    case TEXTURE_CHANNEL.R:
      return 0
    case TEXTURE_CHANNEL.G:
      return 1
    case TEXTURE_CHANNEL.B:
      return 2
    case TEXTURE_CHANNEL.A:
      return 3
    default:
      return 0
  }
}

/**
 * Whether a TextureChannel value selects a single channel that must be extracted
 * (R/G/B/A) as opposed to RGB / a non-extracting value.
 * @param {number} channel
 * @returns {boolean}
 */
export function channelNeedsExtraction(channel) {
  return (
    channel === TEXTURE_CHANNEL.R ||
    channel === TEXTURE_CHANNEL.G ||
    channel === TEXTURE_CHANNEL.B ||
    channel === TEXTURE_CHANNEL.A
  )
}

/**
 * Fullscreen-quad passthrough vertex shader for the channel-extraction passes.
 * Writes clip-space directly from the unit-quad position (a `PlaneGeometry(2, 2)`
 * whose vertices sit at ±1), so the camera setup is irrelevant — but the source
 * geometry MUST be that 2×2 quad. The runtimes' ortho cameras differ; this shader
 * intentionally ignores them.
 * @type {string}
 */
export const CHANNEL_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

/**
 * Extracts a single channel to grayscale. `uChannel` is 0-based (R=0, G=1, B=2,
 * A=3); `uInvert` (0/1) flips the value (Glossiness → Roughness).
 * @type {string}
 */
export const CHANNEL_EXTRACT_FRAGMENT_SHADER = `
  uniform sampler2D uTexture;
  uniform int uChannel; // 0=R, 1=G, 2=B, 3=A
  uniform int uInvert; // 0=no, 1=output 1.0 - value
  varying vec2 vUv;

  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    float channelValue;

    if (uChannel == 0) channelValue = texColor.r;
    else if (uChannel == 1) channelValue = texColor.g;
    else if (uChannel == 2) channelValue = texColor.b;
    else channelValue = texColor.a;

    float v = uInvert == 1 ? 1.0 - channelValue : channelValue;
    gl_FragColor = vec4(v, v, v, 1.0);
  }
`

/**
 * Inverts the RGB channels (alpha preserved). Used for a Glossiness texture
 * sourced as full-RGB grayscale that needs flipping to behave as roughness.
 * @type {string}
 */
export const RGB_INVERT_FRAGMENT_SHADER = `
  uniform sampler2D uTexture;
  varying vec2 vUv;

  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    gl_FragColor = vec4(1.0 - texColor.rgb, texColor.a);
  }
`

// Side-effect: expose on window for the Puppeteer page.evaluate (classic-script
// context), parity with the other shared lib modules. Lets the worker's
// applyTextures reach the map + shaders without an import.
if (typeof window !== 'undefined') {
  window.modelibrTextureChannels = {
    TEXTURE_TYPE,
    TEXTURE_CHANNEL,
    MATERIAL_SLOT_BY_TEXTURE_TYPE,
    INVERTED_TEXTURE_TYPES,
    COLOR_MATERIAL_SLOTS,
    resolveMaterialSlot,
    textureTypeNeedsInvert,
    slotIsColorData,
    getChannelUniformIndex,
    channelNeedsExtraction,
    CHANNEL_VERTEX_SHADER,
    CHANNEL_EXTRACT_FRAGMENT_SHADER,
    RGB_INVERT_FRAGMENT_SHADER,
  }
}
