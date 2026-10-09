/**
 * Camera framing for the model thumbnail render.
 *
 * The render camera has to frame a model the same way whether it is orbited or
 * played back frame by frame, so the distance math lives here rather than inline
 * in render-template.html and is unit-testable without a renderer.
 */

/** Vertical field of view of the render camera, in degrees. */
export const RENDER_FOV_DEGREES = 45

/**
 * Production framing coverage: the union box's camera-facing extent fills this
 * fraction of the frame's vertical FOV. Kept inside the 70-80% band and a little
 * under its middle, so the perspective silhouette of the nearest pose - which
 * projects slightly larger than the box's centre plane - still stays in band.
 */
export const FRAMING_COVERAGE = 0.72

/**
 * Distance a perspective camera needs so a box's camera-facing extent fills
 * `coverage` of the frame's vertical field of view.
 *
 * The thumbnail frame is square and the camera looks straight down the depth
 * axis, so only the box's `x` (horizontal) and `y` (vertical) extents project
 * onto the frame - the wider of the two is the one that has to fit. At coverage
 * 0.75 a unit box spans 75% of the frame in both directions.
 *
 * @param {{x:number, y:number}} size - box size in the camera's target plane
 * @param {{fovDegrees?:number, coverage?:number, minDistance?:number}} [options]
 * @returns {number} camera distance along the view axis
 */
export function computeFramingDistance(size, options = {}) {
  const {
    fovDegrees = RENDER_FOV_DEGREES,
    coverage = FRAMING_COVERAGE,
    minDistance = 0,
  } = options

  if (!size) return minDistance
  const extent = Math.max(size.x, size.y)
  if (!(extent > 0) || !(coverage > 0)) return minDistance

  const halfFovRadians = (fovDegrees * Math.PI) / 360
  const distance = extent / (2 * Math.tan(halfFovRadians) * coverage)
  return Math.max(distance, minDistance)
}

/**
 * Union of a model's world-space bounds across the instants of one clip.
 *
 * `AnimationMixer.setTime()` moves bones and morph targets but leaves world
 * matrices stale, and a SkinnedMesh's `bindMatrixInverse` is refreshed only by
 * its own `updateMatrixWorld` - the `updateWorldMatrix` that Box3 calls per
 * object does not do it. A root scale applied after binding (normalizeModel)
 * would therefore be counted twice and the union inflated, pushing the camera
 * far away and leaving the model a small dot in the frame. Recomputing the full
 * matrix tree at each instant keeps the precise skinned bounds honest. Only
 * meshes are measured, so helpers and bones (which carry no geometry) cannot
 * widen the box.
 *
 * @param {object} THREE - three namespace (for Box3)
 * @param {object} root - model root carrying the clip
 * @param {object} mixer - AnimationMixer bound to `root`
 * @param {{duration:number, samples?:number}} clip
 * @returns {object|null} union Box3, or null when nothing finite was measured
 */
export function sampleAnimatedBounds(
  THREE,
  root,
  mixer,
  { duration, samples = 12 } = {}
) {
  if (!(duration > 0)) return null

  const count = Math.max(2, Math.floor(samples) || 12)
  const union = new THREE.Box3()
  let hasBounds = false

  for (let i = 0; i < count; i++) {
    mixer.setTime((duration * i) / count)
    root.updateMatrixWorld(true)

    const box = new THREE.Box3()
    root.traverse(object => {
      if (object.isMesh) {
        // precise=true follows skinned vertices and morph targets, not just the
        // bind-pose geometry.
        box.expandByObject(object, true)
      }
    })

    if (Number.isFinite(box.min.x)) {
      union.union(box)
      hasBounds = true
    }
  }

  return hasBounds ? union : null
}
