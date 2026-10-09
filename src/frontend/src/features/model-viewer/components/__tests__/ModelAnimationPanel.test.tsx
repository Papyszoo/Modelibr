import { readFileSync } from 'node:fs'
import path from 'node:path'
import { TextDecoder, TextEncoder } from 'node:util'

import { fireEvent, render, screen, within } from '@testing-library/react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

import { ModelAnimationController } from '@/features/model-viewer/animation/ModelAnimationController'
import { ModelAnimationPanel } from '@/features/model-viewer/components/ModelAnimationPanel'

/**
 * Drives the real animation panel against the committed animated fixtures,
 * loaded through GLTFLoader exactly as the viewer loads them. The controller
 * is framework-free, so the same object the test asserts on is the one the
 * panel drives - a regression in playback wiring shows up here, not just in a
 * label.
 *
 * The regressions these guard:
 *   - the scrub time not reaching the mixer (readout lies)
 *   - sliders writing weights while a morph clip is playing (clip fight)
 *   - a static model growing an Animation section it has nothing for.
 */

// jsdom has no createImageBitmap; GLTFLoader decodes the fixtures' embedded PNGs
// with it. A 4x4 stub is enough - the panel never reads a pixel.
;(globalThis as { createImageBitmap?: unknown }).createImageBitmap =
  async () => ({
    width: 4,
    height: 4,
    close() {},
  })
// jsdom has no TextDecoder/TextEncoder; three uses them for the glTF JSON and
// buffer.
;(globalThis as { TextDecoder?: unknown }).TextDecoder = TextDecoder
;(globalThis as { TextEncoder?: unknown }).TextEncoder = TextEncoder

// jsdom's fetch/Request/Headers are missing, and three's loaders fetch the
// fixtures' data: URIs. These minimal shims serve a data: URL as bytes so the
// loader sees a normal 200 response; nothing leaves the process.
interface FakeResponseInit {
  url: string
}

function dataUrlBytes(url: string): Uint8Array {
  const comma = url.indexOf(',')
  const meta = url.slice(5, comma)
  const payload = decodeURIComponent(url.slice(comma + 1))
  return /;base64/.test(meta)
    ? new Uint8Array(Buffer.from(payload, 'base64'))
    : new TextEncoder().encode(payload)
}

class FakeRequest {
  url: string
  constructor(input: object | string) {
    this.url =
      typeof input === 'string' ? input : (input as FakeResponseInit).url
  }
}

class FakeHeaders {
  get(): string | null {
    return null
  }
}

;(globalThis as { Request?: unknown }).Request = FakeRequest
;(globalThis as { Headers?: unknown }).Headers = FakeHeaders
;(globalThis as { fetch?: unknown }).fetch = async (
  input: FakeRequest | string
) => {
  const url = typeof input === 'string' ? input : input.url
  const bytes = dataUrlBytes(url)
  return {
    status: 200,
    headers: new FakeHeaders(),
    body: undefined,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    blob: async () => new Blob([bytes], { type: 'application/octet-stream' }),
    text: async () => new TextDecoder().decode(bytes),
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
  }
}

const FIXTURE_DIR = path.resolve(
  __dirname,
  '../../../../../../asset-processor/test/fixtures/animated'
)

function parseFixture(fileName: string): Promise<THREE.Group> {
  const source = readFileSync(path.join(FIXTURE_DIR, fileName), 'utf8')
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      source,
      '',
      gltf => {
        // The viewer reads clips off the model root (see Model.tsx), so keep
        // the fixture faithful to that path.
        gltf.scene.animations = gltf.animations
        resolve(gltf.scene)
      },
      reject
    )
  })
}

async function renderCombined() {
  const scene = await parseFixture('combined.gltf')
  const controller = new ModelAnimationController()
  controller.setRoot(scene, scene.animations)

  let mesh: THREE.Mesh | null = null
  scene.traverse(child => {
    if (!mesh && (child as THREE.Mesh).isMesh) {
      mesh = child as THREE.Mesh
    }
  })

  render(<ModelAnimationPanel controller={controller} />)
  return { controller, mesh: mesh as THREE.Mesh | null }
}

function sliderHandle(testId: string): HTMLElement {
  return within(screen.getByTestId(testId)).getByRole('slider')
}

function dropdownPanel(): HTMLElement {
  const panel = document.querySelector('.p-dropdown-panel')
  if (!panel) throw new Error('dropdown panel not open')
  return panel as HTMLElement
}

describe('ModelAnimationPanel', () => {
  it('lists the clips with their durations', async () => {
    await renderCombined()

    // First clip is selected by default. The dropdown renders both the visible
    // label and a hidden native <option>, so pin the visible label.
    expect(
      within(screen.getByTestId('animation-clip-select')).getByText(
        'Wave - 1.00 s',
        { selector: '.p-dropdown-label' }
      )
    ).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('animation-clip-select'))

    expect(
      within(dropdownPanel()).getByText('Wave - 1.00 s')
    ).toBeInTheDocument()
    expect(
      within(dropdownPanel()).getByText('Pulse - 2.00 s')
    ).toBeInTheDocument()
  })

  it('toggles play and pause on the action', async () => {
    const { controller } = await renderCombined()
    const action = controller.getActiveAction()
    expect(action).not.toBeNull()
    expect(action!.paused).toBe(true)

    fireEvent.click(screen.getByTestId('animation-play-toggle'))
    expect(controller.getSnapshot().playing).toBe(true)
    expect(action!.paused).toBe(false)
    expect(screen.getByTestId('animation-play-toggle')).toHaveAttribute(
      'aria-label',
      'Pause'
    )

    fireEvent.click(screen.getByTestId('animation-play-toggle'))
    expect(controller.getSnapshot().playing).toBe(false)
    expect(action!.paused).toBe(true)
  })

  it('scrubbing sets the readout and the mixer time', async () => {
    const { controller } = await renderCombined()

    // PageUp is ten steps of 0.01 -> 0.10 on the 1.00 s Wave clip.
    fireEvent.keyDown(sliderHandle('animation-scrub'), { key: 'PageUp' })

    expect(screen.getByTestId('animation-time')).toHaveTextContent(
      '0.10 / 1.00 s'
    )
    expect(controller.getActiveAction()!.time).toBeCloseTo(0.1, 5)
    expect(controller.getSnapshot().playing).toBe(false)
  })

  it('speed changes the action time scale', async () => {
    const { controller } = await renderCombined()

    fireEvent.click(screen.getByTestId('animation-speed-select'))
    fireEvent.click(within(dropdownPanel()).getByText('1.5x'))

    expect(controller.getSnapshot().speed).toBe(1.5)
    expect(controller.getActiveAction()!.timeScale).toBe(1.5)
  })

  it('loop off clamps the action once', async () => {
    const { controller } = await renderCombined()
    const action = controller.getActiveAction()!
    expect(action.loop).toBe(THREE.LoopRepeat)

    fireEvent.click(screen.getByTestId('animation-loop-toggle'))

    expect(controller.getSnapshot().loop).toBe(false)
    expect(action.loop).toBe(THREE.LoopOnce)
    expect(action.clampWhenFinished).toBe(true)
  })

  it('shape-key sliders write morphTargetInfluences directly', async () => {
    const { mesh } = await renderCombined()
    expect(mesh!.morphTargetInfluences).toEqual([0, 0])

    // Eight PageUp presses on the 0..1 slider -> 0.80.
    for (let i = 0; i < 8; i++) {
      fireEvent.keyDown(sliderHandle('animation-shapekey-Squash'), {
        key: 'PageUp',
      })
    }

    expect(mesh!.morphTargetInfluences![0]).toBeCloseTo(0.8, 5)
    expect(mesh!.morphTargetInfluences![1]).toBe(0)

    fireEvent.click(screen.getByTestId('animation-reset-shapekeys'))
    expect(mesh!.morphTargetInfluences).toEqual([0, 0])
  })

  it('locks shape-key sliders while the morph clip plays', async () => {
    const { controller } = await renderCombined()

    // Switch to Pulse (the morph clip), then play it.
    fireEvent.click(screen.getByTestId('animation-clip-select'))
    fireEvent.click(within(dropdownPanel()).getByText('Pulse - 2.00 s'))
    fireEvent.click(screen.getByTestId('animation-play-toggle'))

    expect(controller.getSnapshot().morphPlaying).toBe(true)
    expect(screen.getByTestId('animation-shapekey-Squash')).toHaveClass(
      /p-disabled/
    )

    // The Wave clip animates no morph targets - its sliders stay live.
    fireEvent.click(screen.getByTestId('animation-clip-select'))
    fireEvent.click(within(dropdownPanel()).getByText('Wave - 1.00 s'))
    expect(controller.getSnapshot().morphPlaying).toBe(false)
    expect(screen.getByTestId('animation-shapekey-Squash')).not.toHaveClass(
      /p-disabled/
    )
  })

  it('renders nothing for a model with no clips and no morphs', () => {
    const scene = new THREE.Group()
    scene.add(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    )
    const controller = new ModelAnimationController()
    controller.setRoot(scene, [])

    render(<ModelAnimationPanel controller={controller} />)

    expect(
      screen.queryByTestId('model-animation-panel')
    ).not.toBeInTheDocument()
  })
})
