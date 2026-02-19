import { GeometryType } from '../components/GeometrySelector'

/**
 * Physical UV Tiling Calculator
 *
 * Computes texture repeat values based on actual geometry dimensions to maintain
 * consistent texel density across all primitive shapes. This ensures that a
 * tileable material (e.g., brick at 1m tile size) looks the same scale on a cube,
 * sphere, cylinder, or torus regardless of their dimensions.
 *
 * Formula: repeat = dimension / uvScale
 * Where `dimension` is the relevant world-space measurement for each face/surface
 * and `uvScale` is the physical size of one texture tile in world units.
 */

interface GeometryDimensions {
  scale: number
  cubeSize?: number
  sphereRadius?: number
  cylinderRadius?: number
  cylinderHeight?: number
  torusRadius?: number
  torusTube?: number
}

interface TilingResult {
  x: number
  y: number
}

/**
 * Calculate the physical tiling (texture.repeat) for a given geometry type and dimensions.
 *
 * @param geometryType - The primitive shape type
 * @param dimensions - The geometry dimension parameters
 * @param uvScale - World-space size of one texture tile (larger = fewer repeats)
 * @returns The computed texture repeat { x, y }
 */
export function getPhysicalTiling(
  geometryType: GeometryType,
  dimensions: GeometryDimensions,
  uvScale: number
): TilingResult {
  const safeScale = Math.max(uvScale, 0.01)
  const geomScale = dimensions.scale || 1

  switch (geometryType) {
    case 'box': {
      // Each cube face is `size × size` in world space.
      // UV repeat = face dimension / tile size
      const size = (dimensions.cubeSize || 2) * geomScale
      return {
        x: size / safeScale,
        y: size / safeScale,
      }
    }

    case 'sphere': {
      // Sphere surface wraps 2πr horizontally (equator circumference)
      // and πr vertically (pole-to-pole arc).
      // We use equator circumference / uvScale for X, and πr / uvScale for Y.
      const radius = (dimensions.sphereRadius || 1.2) * geomScale
      const circumference = 2 * Math.PI * radius
      const halfCircumference = Math.PI * radius
      return {
        x: circumference / safeScale,
        y: halfCircumference / safeScale,
      }
    }

    case 'cylinder': {
      // Cylinder body: horizontal = circumference (2πr), vertical = height.
      // Caps use the same scaling as the body for consistency.
      const radius = (dimensions.cylinderRadius || 1) * geomScale
      const height = (dimensions.cylinderHeight || 2) * geomScale
      const circumference = 2 * Math.PI * radius
      return {
        x: circumference / safeScale,
        y: height / safeScale,
      }
    }

    case 'torus': {
      // Torus has two radii: R (major) and r (tube).
      // Horizontal (around the ring) = 2πR, vertical (around tube cross-section) = 2πr.
      const majorRadius = (dimensions.torusRadius || 1) * geomScale
      const tubeRadius = (dimensions.torusTube || 0.4) * geomScale
      const ringCircumference = 2 * Math.PI * majorRadius
      const tubeCircumference = 2 * Math.PI * tubeRadius
      return {
        x: ringCircumference / safeScale,
        y: tubeCircumference / safeScale,
      }
    }

    default:
      return { x: 1, y: 1 }
  }
}
