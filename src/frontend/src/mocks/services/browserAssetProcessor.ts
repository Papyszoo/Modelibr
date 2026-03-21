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
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// ─── Model Thumbnails ───────────────────────────────────────────────────

/**
 * Render a GLTF/GLB blob to a PNG thumbnail blob.
 * Falls back to a colored placeholder on any error.
 */
export async function generateModelThumbnail(
  blob: Blob,
  width = 256,
  height = 256
): Promise<Blob> {
  try {
    const url = URL.createObjectURL(blob)
    try {
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

  // Frame the model
  const box = new Box3().setFromObject(gltf.scene)
  const center = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5

  camera.position.set(
    center.x + distance * 0.5,
    center.y + distance * 0.3,
    center.z + distance
  )
  camera.lookAt(center)

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
