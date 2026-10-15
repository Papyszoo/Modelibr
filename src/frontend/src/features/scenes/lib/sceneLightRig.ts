import type { SceneLight } from '../types'

/**
 * Whether the viewport adds its default ambient fill on top of the document's
 * lights.
 *
 * The document's lights are the scene; the fill exists so a scene nobody has
 * lit yet is still readable, and so adding a key light never makes the picture
 * DARKER than it was. The previous rule dropped the whole default rig at the
 * first authored light, and the editor's Light button adds only a directional
 * key - so the scene went dark the moment it was lit.
 *
 * An authored ambient light is the one thing that replaces the fill: it is the
 * document saying what its ambient is, even when that answer is zero.
 */
export function needsAmbientFill(lights: SceneLight[]): boolean {
  return !lights.some(light => light.type === 'ambient')
}
