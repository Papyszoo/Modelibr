/**
 * Browser-side Asset Processor for Demo Mode
 *
 * Replaces the real backend's asset-processor (Puppeteer + Three.js) and
 * audio waveform generation with purely in-browser alternatives.
 *
 * 1. Model Thumbnails — Three.js WebGLRenderer on an OffscreenCanvas
 * 2. Audio Waveforms  — OfflineAudioContext peak extraction → Canvas 2D PNG
 */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  type Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// ─── Model Thumbnails ───────────────────────────────────────────────────

/**
 * Override all mesh materials with a neutral standard material
 * for consistent thumbnail appearance (matches real worker behaviour).
 */
function applyStandardMaterial(model: Object3D) {
  model.traverse(child => {
    if (child instanceof Mesh) {
      child.material = new MeshStandardMaterial({
        color: new Color(0.7, 0.7, 0.9),
        metalness: 0.3,
        roughness: 0.4,
      })
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

/**
 * Normalize a model to fit within a unit box centred at the origin.
 * Matches the real worker's normalizeModel() approach.
 */
function normalizeModel(model: Object3D, targetScale = 2.0) {
  const box = new Box3().setFromObject(model)
  const size = box.getSize(new Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim > 0) {
    const scaleFactor = targetScale / maxDim
    model.scale.setScalar(scaleFactor)
  }
  // Recalculate after scaling
  const scaledBox = new Box3().setFromObject(model)
  const scaledCenter = scaledBox.getCenter(new Vector3())
  model.position.x = -scaledCenter.x
  model.position.y = -scaledCenter.y
  model.position.z = -scaledCenter.z
}

/**
 * Render a GLTF/GLB or FBX blob to a PNG thumbnail blob.
 * Falls back to a colored placeholder on any error.
 */
export async function generateModelThumbnail(
  blob: Blob,
  width = 256,
  height = 256,
  fileName?: string
): Promise<Blob> {
  try {
    const url = URL.createObjectURL(blob)
    try {
      const ext = (fileName ?? '').split('.').pop()?.toLowerCase()
      if (ext === 'fbx') {
        return await renderFbxThumbnail(url, width, height)
      }
      return await renderGltfThumbnail(url, width, height)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return generatePlaceholderThumbnail(width, height, '#4a90d9')
  }
}

async function renderGltfThumbnail(
  url: string,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(width, height)
  renderer.setClearColor(0x2a2a2e, 1)

  const scene = new Scene()
  const camera = new PerspectiveCamera(45, width / height, 0.01, 1000)

  // Lighting
  scene.add(new AmbientLight(0xffffff, 0.6))
  const dirLight = new DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(5, 10, 7)
  scene.add(dirLight)

  // Load model
  const loader = new GLTFLoader()
  const gltf = await new Promise<{ scene: Group }>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })

  scene.add(gltf.scene)
  applyStandardMaterial(gltf.scene)
  normalizeModel(gltf.scene)

  // Position camera to frame the normalized model (centred at origin, ~2 units)
  const fov = camera.fov * (Math.PI / 180)
  const distance = (2.0 / (2 * Math.tan(fov / 2))) * 1.8
  camera.position.set(distance * 0.5, distance * 0.3, distance)
  camera.lookAt(0, 0, 0)

  renderer.render(scene, camera)

  const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png'
    )
  })

  renderer.dispose()
  return thumbnailBlob
}

async function renderFbxThumbnail(
  url: string,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(width, height)
  renderer.setClearColor(0x2a2a2e, 1)

  const scene = new Scene()
  const camera = new PerspectiveCamera(45, width / height, 0.01, 1000)

  scene.add(new AmbientLight(0xffffff, 0.6))
  const dirLight = new DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(5, 10, 7)
  scene.add(dirLight)

  const loader = new FBXLoader()
  const fbxScene = await new Promise<Group>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })

  scene.add(fbxScene)
  applyStandardMaterial(fbxScene)
  normalizeModel(fbxScene)

  // Position camera to frame the normalized model (centred at origin, ~2 units)
  const fov = camera.fov * (Math.PI / 180)
  const distance = (2.0 / (2 * Math.tan(fov / 2))) * 1.8
  camera.position.set(distance * 0.5, distance * 0.3, distance)
  camera.lookAt(0, 0, 0)

  renderer.render(scene, camera)

  const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png'
    )
  })

  renderer.dispose()
  return thumbnailBlob
}

/**
 * Generate a simple colored placeholder PNG for non-renderable models.
 */
export function generatePlaceholderThumbnail(
  width = 256,
  height = 256,
  color = '#4a90d9'
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#2a2a2e'
  ctx.fillRect(0, 0, width, height)

  // Draw a simple 3D cube icon
  ctx.fillStyle = color
  const cx = width / 2
  const cy = height / 2
  const s = Math.min(width, height) * 0.3
  ctx.beginPath()
  ctx.moveTo(cx, cy - s)
  ctx.lineTo(cx + s, cy - s * 0.4)
  ctx.lineTo(cx + s, cy + s * 0.4)
  ctx.lineTo(cx, cy + s)
  ctx.lineTo(cx - s, cy + s * 0.4)
  ctx.lineTo(cx - s, cy - s * 0.4)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.font = `${Math.round(s * 0.4)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('3D', cx, cy)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png'
    )
  })
}

// ─── Texture Set Thumbnails ─────────────────────────────────────────────

/**
 * Render a texture set thumbnail: paint the albedo texture onto a sphere
 * using Three.js and return a PNG blob.
 * Falls back to a colored square if the texture can't be loaded.
 */
export async function generateTextureSetThumbnail(
  albedoBlob: Blob | null,
  width = 256,
  height = 256
): Promise<Blob> {
  if (!albedoBlob) {
    return generatePlaceholderThumbnail(width, height, '#7b5ea7')
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)
    renderer.setClearColor(0x2a2a2e, 1)

    const scene = new Scene()
    const camera = new PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 3)
    camera.lookAt(0, 0, 0)

    scene.add(new AmbientLight(0xffffff, 0.6))
    const dl = new DirectionalLight(0xffffff, 0.8)
    dl.position.set(3, 5, 4)
    scene.add(dl)

    // Load albedo as texture
    const imageBitmap = await createImageBitmap(albedoBlob)
    const texture = new (await import('three')).CanvasTexture(
      imageBitmap as unknown as HTMLCanvasElement
    )

    const geometry = new SphereGeometry(1, 32, 32)
    const material = new MeshStandardMaterial({ map: texture })
    scene.add(new Mesh(geometry, material))

    renderer.render(scene, camera)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/png'
      )
    })

    renderer.dispose()
    geometry.dispose()
    material.dispose()
    texture.dispose()

    return blob
  } catch {
    return generatePlaceholderThumbnail(width, height, '#7b5ea7')
  }
}

// ─── Audio Waveforms ────────────────────────────────────────────────────

/**
 * Decode an audio blob and extract peak data, then draw a waveform PNG.
 */
export async function generateWaveformThumbnail(
  audioBlob: Blob,
  width = 800,
  height = 128
): Promise<{ thumbnail: Blob; peaks: number[]; duration: number }> {
  const arrayBuffer = await audioBlob.arrayBuffer()

  const audioCtx = new OfflineAudioContext(1, 1, 44100)
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

  const channelData = audioBuffer.getChannelData(0)
  const duration = audioBuffer.duration

  // Extract peaks
  const peakCount = width
  const samplesPerPeak = Math.floor(channelData.length / peakCount)
  const peaks: number[] = []
  for (let i = 0; i < peakCount; i++) {
    let max = 0
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, channelData.length)
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j])
      if (abs > max) max = abs
    }
    peaks.push(max)
  }

  // Draw waveform
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#1a1a1e'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#4a90d9'
  const midY = height / 2
  for (let i = 0; i < peaks.length; i++) {
    const barHeight = peaks[i] * midY
    ctx.fillRect(i, midY - barHeight, 1, barHeight * 2)
  }

  const thumbnail = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png'
    )
  })

  return { thumbnail, peaks, duration: Math.round(duration * 1000) }
}

// ─── EXR Channel Previews ───────────────────────────────────────────────

/**
 * Reinhard tone-mapping for HDR → LDR conversion.
 * Mirrors the worker's imagePreviewGenerator.js implementation.
 */
function toneMapReinhard(value: number): number {
  if (value <= 0) return 0
  const mapped = value / (1 + value)
  const srgb = Math.pow(mapped, 1 / 2.2)
  return Math.min(255, Math.round(srgb * 255))
}

/**
 * Parse an EXR blob and render a specific channel as a PNG blob.
 * @param exrBlob - The raw EXR file blob
 * @param channel - 'rgb' | 'r' | 'g' | 'b'
 */
export async function generateExrChannelPreview(
  exrBlob: Blob,
  channel: string = 'rgb'
): Promise<Blob> {
  const { EXRLoader } = await import('three/addons/loaders/EXRLoader.js')
  const loader = new EXRLoader()

  const arrayBuffer = await exrBlob.arrayBuffer()
  const exrData = loader.parse(arrayBuffer)
  const { width, height, data } = exrData
  // THREE.RGBAFormat = 1023
  const isRGBA = exrData.format === 1023
  const pixelStride = isRGBA ? 4 : 1

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)
  const pixels = imageData.data

  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * pixelStride
    const dstIdx = i * 4

    if (isRGBA) {
      const r = toneMapReinhard(data[srcIdx])
      const g = toneMapReinhard(data[srcIdx + 1])
      const b = toneMapReinhard(data[srcIdx + 2])

      switch (channel) {
        case 'r':
          pixels[dstIdx] = r
          pixels[dstIdx + 1] = r
          pixels[dstIdx + 2] = r
          break
        case 'g':
          pixels[dstIdx] = g
          pixels[dstIdx + 1] = g
          pixels[dstIdx + 2] = g
          break
        case 'b':
          pixels[dstIdx] = b
          pixels[dstIdx + 1] = b
          pixels[dstIdx + 2] = b
          break
        default: // 'rgb'
          pixels[dstIdx] = r
          pixels[dstIdx + 1] = g
          pixels[dstIdx + 2] = b
          break
      }
    } else {
      const val = toneMapReinhard(data[srcIdx])
      pixels[dstIdx] = val
      pixels[dstIdx + 1] = val
      pixels[dstIdx + 2] = val
    }
    pixels[dstIdx + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png'
    )
  })
}

/**
 * Generate a channel-specific preview for a standard image (PNG/JPG).
 * For 'rgb', just returns the original blob. For 'r'/'g'/'b', extracts
 * the single channel as a grayscale PNG.
 */
export async function generateImageChannelPreview(
  imageBlob: Blob,
  channel: string = 'rgb'
): Promise<Blob> {
  if (channel === 'rgb') return imageBlob

  const bitmap = await createImageBitmap(imageBlob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  const pixels = imageData.data

  const channelOffset = channel === 'r' ? 0 : channel === 'g' ? 1 : 2

  for (let i = 0; i < pixels.length; i += 4) {
    const val = pixels[i + channelOffset]
    pixels[i] = val
    pixels[i + 1] = val
    pixels[i + 2] = val
    // alpha stays unchanged
  }

  ctx.putImageData(imageData, 0, 0)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png'
    )
  })
}
