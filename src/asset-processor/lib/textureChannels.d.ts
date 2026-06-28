/**
 * Type declarations for the shared texture-type → material-slot map and the
 * channel-extraction shaders. Implementation in `./textureChannels.js` is plain
 * ESM; this shim lets the TypeScript frontend import it without
 * `// @ts-expect-error`.
 */

/** TextureType enum mirror (matches `Domain/ValueObjects/TextureType.cs`). */
export const TEXTURE_TYPE: Readonly<Record<string, number>>

/** TextureChannel enum mirror (matches `Domain/ValueObjects/TextureChannel.cs`). */
export const TEXTURE_CHANNEL: Readonly<Record<string, number>>

/** Canonical texture type → MeshPhysicalMaterial slot. */
export const MATERIAL_SLOT_BY_TEXTURE_TYPE: Readonly<Record<number, string>>

/** Texture types whose values must be inverted at load (Glossiness). */
export const INVERTED_TEXTURE_TYPES: ReadonlySet<number>

/** Material slots that carry sRGB color data (vs linear data). */
export const COLOR_MATERIAL_SLOTS: ReadonlySet<string>

/** Resolve the material slot a texture type feeds, or null if it has none. */
export function resolveMaterialSlot(textureType: number): string | null

/** Whether a texture type's values must be inverted at load (Glossiness). */
export function textureTypeNeedsInvert(textureType: number): boolean

/** Whether a material slot carries sRGB color data (vs linear data). */
export function slotIsColorData(slot: string): boolean

/** Map a TextureChannel value to the 0-based `uChannel` shader index. */
export function getChannelUniformIndex(channel: number): number

/** Whether a TextureChannel value selects a single channel to extract (R/G/B/A). */
export function channelNeedsExtraction(channel: number): boolean

/** Fullscreen-quad passthrough vertex shader for the extraction passes. */
export const CHANNEL_VERTEX_SHADER: string

/** Extracts a single channel to grayscale (`uChannel` 0-based, `uInvert` 0/1). */
export const CHANNEL_EXTRACT_FRAGMENT_SHADER: string

/** Inverts the RGB channels (alpha preserved); for full-RGB Glossiness. */
export const RGB_INVERT_FRAGMENT_SHADER: string
