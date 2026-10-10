import * as THREE from 'three'

/**
 * One animation clip exposed to the panel.
 */
export interface AnimationClipInfo {
  name: string
  duration: number
}

/**
 * One mesh's shape keys exposed to the panel.
 */
export interface ShapeKeyGroupInfo {
  meshName: string
  keys: string[]
}

/**
 * The current weight of one shape key, read live off the mesh.
 */
export interface ShapeKeyValue {
  meshName: string
  key: string
  value: number
}

/**
 * Everything the panel needs to render, as a single immutable object so
 * `useSyncExternalStore` can compare identities.
 */
export interface AnimationSnapshot {
  clips: AnimationClipInfo[]
  shapeKeyGroups: ShapeKeyGroupInfo[]
  shapeKeyValues: ShapeKeyValue[]
  activeClipIndex: number
  playing: boolean
  loop: boolean
  speed: number
  time: number
  duration: number
  /** A clip that animates morph targets is playing - shape-key sliders lock. */
  morphPlaying: boolean
  /** Bumped whenever the loaded scene is replaced so the panel can reset. */
  rootVersion: number
}

const MORPH_TRACK_SUFFIX = 'morphTargetInfluences'
const CROSSFADE_SECONDS = 0.2
// The scrub readout and live shape-key values are polled at most this often
// (10 updates a second), so a playing clip cannot drive a re-render per frame.
const NOTIFY_INTERVAL_SECONDS = 0.1

interface MorphMesh {
  mesh: THREE.Mesh
  name: string
  keys: string[]
}

function clipHasMorphTracks(clip: THREE.AnimationClip | null): boolean {
  if (!clip) return false
  return clip.tracks.some(track => track.name.endsWith(MORPH_TRACK_SUFFIX))
}

/**
 * Owns the single `AnimationMixer` for the scene the viewer has on screen and
 * the shape-key weights of every mesh in it.
 *
 * It is deliberately framework-free: the panel drives it through imperative
 * methods and subscribes for snapshots, while an in-canvas runner calls
 * {@link update} from `useFrame`. That keeps playback logic testable without a
 * WebGL context.
 */
export class ModelAnimationController {
  private root: THREE.Object3D | null = null
  private mixer: THREE.AnimationMixer | null = null
  private actions: THREE.AnimationAction[] = []
  private clips: THREE.AnimationClip[] = []
  private morphMeshes: MorphMesh[] = []
  private activeIndex = 0
  private playing = false
  private loopEnabled = true
  private speedValue = 1
  private timeValue = 0
  private rootVersion = 0
  private notifyAccumulator = 0
  private readonly listeners = new Set<() => void>()
  private snapshot: AnimationSnapshot = this.buildSnapshot()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): AnimationSnapshot => this.snapshot

  getRoot(): THREE.Object3D | null {
    return this.root
  }

  /** The action for the selected clip - exposed for tests and diagnostics. */
  getActiveAction(): THREE.AnimationAction | null {
    return this.actions[this.activeIndex] ?? null
  }

  /**
   * Bind the controller to a freshly cloned scene. Replaces whatever was
   * loaded before: defaults to the first clip, paused at t=0.
   */
  setRoot(root: THREE.Object3D, animations?: THREE.AnimationClip[]): void {
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer.removeEventListener('finished', this.handleFinished)
    }

    this.root = root
    this.mixer = null
    this.actions = []
    this.clips = (animations ?? []).filter(clip => clip.tracks.length > 0)
    this.morphMeshes = []

    root.traverse(child => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.morphTargetDictionary) return
      const keys = Object.keys(mesh.morphTargetDictionary)
      if (keys.length > 0) {
        // The mesh's own name, however empty: the extractor stores
        // `mesh.name || ''` for the same meshes (puppeteerRenderer) and the
        // backend keys shape keys on that, so inventing 'Mesh' here made the
        // panel name a mesh the metadata calls ''. The empty case is labelled
        // at the display site instead.
        this.morphMeshes.push({ mesh, name: mesh.name, keys })
      }
    })

    if (this.clips.length > 0) {
      this.mixer = new THREE.AnimationMixer(root)
      this.mixer.addEventListener('finished', this.handleFinished)
      this.actions = this.clips.map(clip => {
        const action = this.mixer!.clipAction(clip)
        action.setEffectiveWeight(1)
        return action
      })
    }

    this.activeIndex = 0
    this.playing = false
    this.loopEnabled = true
    this.speedValue = 1
    this.timeValue = 0
    this.applyLoopSettings()

    const action = this.getActiveAction()
    if (action) {
      action.reset()
      action.time = 0
      action.paused = true
      action.play()
    }
    this.mixer?.update(0)

    this.rootVersion += 1
    this.emit()
  }

  selectClip(index: number): void {
    if (index < 0 || index >= this.clips.length || index === this.activeIndex) {
      return
    }

    const previous = this.getActiveAction()
    this.activeIndex = index
    const next = this.getActiveAction()

    if (previous && next && this.playing) {
      next.reset()
      next.setEffectiveTimeScale(this.speedValue)
      next.setEffectiveWeight(1)
      next.play()
      next.crossFadeFrom(previous, CROSSFADE_SECONDS, true)
    } else {
      previous?.stop()
      if (next) {
        next.reset()
        next.setEffectiveTimeScale(this.speedValue)
        next.paused = true
        next.play()
      }
    }

    this.timeValue = 0
    this.mixer?.update(0)
    this.emit()
  }

  play(): void {
    const action = this.getActiveAction()
    if (!action || this.playing) return

    const duration = this.clips[this.activeIndex]?.duration ?? 0
    if (!this.loopEnabled && action.time >= duration - 1e-4) {
      action.reset()
      this.timeValue = 0
    }

    action.paused = false
    action.setEffectiveTimeScale(this.speedValue)
    this.playing = true
    this.emit()
  }

  pause(): void {
    const action = this.getActiveAction()
    if (!action) return
    action.paused = true
    this.playing = false
    this.emit()
  }

  toggle(): void {
    if (this.playing) {
      this.pause()
    } else {
      this.play()
    }
  }

  /** Scrub to an exact time. Dragging always pauses. */
  setTime(seconds: number): void {
    const action = this.getActiveAction()
    if (!action) return

    const duration = this.clips[this.activeIndex]?.duration ?? 0
    const clamped = Math.min(Math.max(seconds, 0), duration)
    this.playing = false
    action.paused = true
    action.time = clamped
    this.timeValue = clamped
    this.mixer?.update(0)
    this.emit()
  }

  setLoop(enabled: boolean): void {
    this.loopEnabled = enabled
    this.applyLoopSettings()
    this.emit()
  }

  setSpeed(speed: number): void {
    this.speedValue = speed
    for (const action of this.actions) {
      action.setEffectiveTimeScale(speed)
    }
    this.emit()
  }

  setShapeKey(meshName: string, key: string, value: number): void {
    const group = this.morphMeshes.find(mesh => mesh.name === meshName)
    if (!group) return
    const index = group.keys.indexOf(key)
    const influences = group.mesh.morphTargetInfluences
    if (index < 0 || !influences) return

    influences[index] = Math.min(Math.max(value, 0), 1)
    this.emit()
  }

  resetShapeKeys(): void {
    for (const group of this.morphMeshes) {
      const influences = group.mesh.morphTargetInfluences
      if (!influences) continue
      influences.fill(0)
    }
    this.emit()
  }

  /** Called once per frame from the in-canvas runner. */
  update(delta: number): void {
    if (!this.mixer || !this.playing) return

    this.mixer.update(delta)
    const duration = this.clips[this.activeIndex]?.duration ?? 0
    const action = this.getActiveAction()
    if (action) {
      this.timeValue = Math.min(action.time, duration)
    }

    this.notifyAccumulator += delta
    if (this.notifyAccumulator >= NOTIFY_INTERVAL_SECONDS) {
      this.notifyAccumulator = 0
      this.emit()
    }
  }

  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer.removeEventListener('finished', this.handleFinished)
    }
    this.mixer = null
    this.actions = []
    this.listeners.clear()
  }

  private handleFinished = (): void => {
    this.playing = false
    this.emit()
  }

  private applyLoopSettings(): void {
    for (const action of this.actions) {
      action.setLoop(
        this.loopEnabled ? THREE.LoopRepeat : THREE.LoopOnce,
        this.loopEnabled ? Infinity : 1
      )
      action.clampWhenFinished = !this.loopEnabled
    }
  }

  private buildSnapshot(): AnimationSnapshot {
    const clip = this.clips[this.activeIndex] ?? null
    return {
      clips: this.clips.map(entry => ({
        name: entry.name || 'Animation',
        duration: entry.duration,
      })),
      shapeKeyGroups: this.morphMeshes.map(group => ({
        meshName: group.name,
        keys: [...group.keys],
      })),
      shapeKeyValues: this.morphMeshes.flatMap(group => {
        const influences = group.mesh.morphTargetInfluences ?? []
        return group.keys.map((key, index) => ({
          meshName: group.name,
          key,
          value: influences[index] ?? 0,
        }))
      }),
      activeClipIndex: this.activeIndex,
      playing: this.playing,
      loop: this.loopEnabled,
      speed: this.speedValue,
      time: this.timeValue,
      duration: clip?.duration ?? 0,
      morphPlaying: this.playing && clipHasMorphTracks(clip),
      rootVersion: this.rootVersion,
    }
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) {
      listener()
    }
  }
}
