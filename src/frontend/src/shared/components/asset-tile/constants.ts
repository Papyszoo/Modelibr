/**
 * Canonical card-width range for asset tiles.
 *
 * One source of truth so the card-width slider behaves identically on every
 * asset surface (Models tab, Sprites, Sounds, Texture Sets, Environment Maps).
 * Anchored to the Models tab — the app's reference identity. Wide tiles (env
 * maps) share the same column-width range; they simply render shorter.
 */
export const ASSET_CARD_WIDTH: {
  min: number
  max: number
  default: number
} = {
  min: 120,
  max: 400,
  default: 180,
}
