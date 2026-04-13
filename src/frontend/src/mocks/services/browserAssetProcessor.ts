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
  CanvasTexture,
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
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'

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

// ─── Orbit Animation (matches real asset processor config.js) ───────────

const ORBIT_ANGLE_STEP = 12 // degrees per frame
const ORBIT_FRAME_COUNT = 30 // 360° / 12°
const ORBIT_FRAMERATE = 10 // fps
const ORBIT_FRAME_DURATION = Math.round(1000 / ORBIT_FRAMERATE) // 100ms
const ORBIT_WEBP_QUALITY = 0.75
const ORBIT_ELEVATION_DEG = 15 // slight elevation for nicer 3D perspective

/**
 * Extract ALPH / VP8 / VP8L sub-chunks from a single-image WebP blob.
 * These are the chunks that go inside an ANMF frame.
 */
function extractFrameChunks(data: Uint8Array): Uint8Array {
  // RIFF <4B size> WEBP <chunks…>  →  skip first 12 bytes
  const chunks: Uint8Array[] = []
  let offset = 12
  while (offset + 8 <= data.length) {
    const fourCC =
      String.fromCharCode(data[offset]) +
      String.fromCharCode(data[offset + 1]) +
      String.fromCharCode(data[offset + 2]) +
      String.fromCharCode(data[offset + 3])
    const chunkSize =
      data[offset + 4] |
      (data[offset + 5] << 8) |
      (data[offset + 6] << 16) |
      (data[offset + 7] << 24)
    const paddedSize = chunkSize + (chunkSize & 1) // RIFF: pad to even
    if (fourCC === 'VP8 ' || fourCC === 'VP8L' || fourCC === 'ALPH') {
      chunks.push(data.slice(offset, offset + 8 + paddedSize))
    }
    offset += 8 + paddedSize
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0)
  const result = new Uint8Array(totalLen)
  let pos = 0
  for (const c of chunks) {
    result.set(c, pos)
    pos += c.length
  }
  return result
}

function writeTag(bytes: Uint8Array, offset: number, tag: string) {
  for (let i = 0; i < tag.length; i++) bytes[offset + i] = tag.charCodeAt(i)
}

function write24LE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >> 8) & 0xff
  bytes[offset + 2] = (value >> 16) & 0xff
}

/**
 * Assemble individual WebP frame blobs into an animated WebP.
 */
async function assembleAnimatedWebP(
  frames: Blob[],
  width: number,
  height: number,
  frameDuration: number
): Promise<Blob> {
  const frameChunks: Uint8Array[] = []
  for (const frame of frames) {
    const buf = new Uint8Array(await frame.arrayBuffer())
    frameChunks.push(extractFrameChunks(buf))
  }

  // Calculate total RIFF payload size ("WEBP" + VP8X + ANIM + ANMFs)
  let riffPayload = 4 // "WEBP"
  riffPayload += 8 + 10 // VP8X chunk
  riffPayload += 8 + 6 // ANIM chunk
  for (const fc of frameChunks) {
    const payloadSize = 16 + fc.length
    riffPayload += 8 + payloadSize + (payloadSize & 1)
  }

  const buffer = new ArrayBuffer(8 + riffPayload)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let off = 0

  // RIFF header
  writeTag(bytes, off, 'RIFF')
  off += 4
  view.setUint32(off, riffPayload, true)
  off += 4
  writeTag(bytes, off, 'WEBP')
  off += 4

  // VP8X — extended features: animation flag (bit 1)
  writeTag(bytes, off, 'VP8X')
  off += 4
  view.setUint32(off, 10, true)
  off += 4
  bytes[off] = 0x02 // animation
  off += 1
  bytes[off] = 0
  bytes[off + 1] = 0
  bytes[off + 2] = 0
  off += 3
  write24LE(bytes, off, width - 1)
  off += 3
  write24LE(bytes, off, height - 1)
  off += 3

  // ANIM — background colour (BGRA transparent), loop count 0 = infinite
  writeTag(bytes, off, 'ANIM')
  off += 4
  view.setUint32(off, 6, true)
  off += 4
  view.setUint32(off, 0, true)
  off += 4 // bg colour
  view.setUint16(off, 0, true)
  off += 2 // loop count

  // ANMF chunks — one per frame
  const w = width - 1
  const h = height - 1
  for (const fc of frameChunks) {
    const payloadSize = 16 + fc.length
    writeTag(bytes, off, 'ANMF')
    off += 4
    view.setUint32(off, payloadSize, true)
    off += 4

    write24LE(bytes, off, 0)
    off += 3 // frame X
    write24LE(bytes, off, 0)
    off += 3 // frame Y
    write24LE(bytes, off, w)
    off += 3 // width-1
    write24LE(bytes, off, h)
    off += 3 // height-1
    write24LE(bytes, off, frameDuration)
    off += 3 // duration ms
    bytes[off] = 0x00
    off += 1 // flags: alpha-blend, no dispose

    bytes.set(fc, off)
    off += fc.length

    if (payloadSize & 1) {
      bytes[off] = 0
      off += 1
    }
  }

  return new Blob([buffer], { type: 'image/webp' })
}

/**
 * Orbit the camera around the model and produce an animated WebP.
 * Matches the real asset-processor's 30-frame 360° orbit.
 */
async function renderOrbitAnimation(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  distance: number,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = renderer.domElement as HTMLCanvasElement
  const elevRad = (ORBIT_ELEVATION_DEG * Math.PI) / 180
  const cosElev = Math.cos(elevRad)
  const sinElev = Math.sin(elevRad)
  const frames: Blob[] = []

  for (let i = 0; i < ORBIT_FRAME_COUNT; i++) {
    const angleRad = (i * ORBIT_ANGLE_STEP * Math.PI) / 180
    camera.position.x = distance * cosElev * Math.sin(angleRad)
    camera.position.y = distance * sinElev
    camera.position.z = distance * cosElev * Math.cos(angleRad)
    camera.lookAt(0, 0, 0)

    renderer.render(scene, camera)

    const frameBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/webp',
        ORBIT_WEBP_QUALITY
      )
    })
    frames.push(frameBlob)
  }

  return assembleAnimatedWebP(frames, width, height, ORBIT_FRAME_DURATION)
}

/**
 * Render a GLTF/GLB or FBX blob to an animated WebP thumbnail.
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
      if (ext === 'obj') {
        return await renderObjThumbnail(url, width, height)
      }
      return await renderGltfThumbnail(url, width, height)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return generatePlaceholderThumbnail(width, height, '#4a90d9')
  }
}

/**
 * Texture map data for applying textures to model thumbnails.
 * TextureType: 1=Albedo, 2=Normal, 5=Roughness, 6=Metallic
 */
export interface TextureMapData {
  textureType: number
  blob: Blob
}

/**
 * Apply texture maps to all meshes in model.
 * Uses albedo for map, normal for normalMap, roughness for roughnessMap, metallic for metalnessMap.
 */
async function applyTextureMaps(
  model: Object3D,
  textures: TextureMapData[]
): Promise<void> {
  const albedoTex = textures.find(t => t.textureType === 1)
  const normalTex = textures.find(t => t.textureType === 2)
  const roughnessTex = textures.find(t => t.textureType === 5)
  const metallicTex = textures.find(t => t.textureType === 6)

  const loadTexture = async (blob: Blob) => {
    const bitmap = await createImageBitmap(blob)
    return new CanvasTexture(bitmap as unknown as HTMLCanvasElement)
  }

  const [albedoMap, normalMap, roughnessMap, metalnessMap] = await Promise.all([
    albedoTex ? loadTexture(albedoTex.blob) : Promise.resolve(null),
    normalTex ? loadTexture(normalTex.blob) : Promise.resolve(null),
    roughnessTex ? loadTexture(roughnessTex.blob) : Promise.resolve(null),
    metallicTex ? loadTexture(metallicTex.blob) : Promise.resolve(null),
  ])

  model.traverse(child => {
    if (child instanceof Mesh) {
      child.material = new MeshStandardMaterial({
        color: albedoMap ? new Color(1, 1, 1) : new Color(0.7, 0.7, 0.9),
        map: albedoMap,
        normalMap: normalMap,
        roughnessMap: roughnessMap,
        metalnessMap: metalnessMap,
        metalness: metalnessMap ? 1.0 : 0.3,
        roughness: roughnessMap ? 1.0 : 0.4,
      })
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

/**
 * Render a model thumbnail with optional texture maps applied.
 */
export async function generateModelThumbnailWithTextures(
  modelBlob: Blob,
  textures: TextureMapData[],
  width = 256,
  height = 256,
  fileName?: string
): Promise<Blob> {
  try {
    const url = URL.createObjectURL(modelBlob)
    try {
      const ext = (fileName ?? '').split('.').pop()?.toLowerCase()
      return await renderModelWithTextures(
        url,
        ext ?? 'glb',
        textures,
        width,
        height
      )
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return generatePlaceholderThumbnail(width, height, '#4a90d9')
  }
}

async function renderModelWithTextures(
  url: string,
  ext: string,
  textures: TextureMapData[],
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

  let model: Group
  if (ext === 'fbx') {
    const loader = new FBXLoader()
    model = await new Promise<Group>((resolve, reject) => {
      loader.load(url, resolve, undefined, reject)
    })
  } else if (ext === 'obj') {
    const loader = new OBJLoader()
    model = await new Promise<Group>((resolve, reject) => {
      loader.load(url, resolve, undefined, reject)
    })
  } else {
    const loader = new GLTFLoader()
    const gltf = await new Promise<{ scene: Group }>((resolve, reject) => {
      loader.load(url, resolve, undefined, reject)
    })
    model = gltf.scene
  }

  scene.add(model)

  if (textures.length > 0) {
    await applyTextureMaps(model, textures)
  } else {
    applyStandardMaterial(model)
  }

  normalizeModel(model)

  const fov = camera.fov * (Math.PI / 180)
  const distance = (2.0 / (2 * Math.tan(fov / 2))) * 1.8

  const thumbnailBlob = await renderOrbitAnimation(
    renderer,
    scene,
    camera,
    distance,
    width,
    height
  )

  renderer.dispose()
  return thumbnailBlob
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

  const thumbnailBlob = await renderOrbitAnimation(
    renderer,
    scene,
    camera,
    distance,
    width,
    height
  )

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

  const thumbnailBlob = await renderOrbitAnimation(
    renderer,
    scene,
    camera,
    distance,
    width,
    height
  )

  renderer.dispose()
  return thumbnailBlob
}

async function renderObjThumbnail(
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

  const loader = new OBJLoader()
  const objScene = await new Promise<Group>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })

  scene.add(objScene)
  applyStandardMaterial(objScene)
  normalizeModel(objScene)

  const fov = camera.fov * (Math.PI / 180)
  const distance = (2.0 / (2 * Math.tan(fov / 2))) * 1.8

  const thumbnailBlob = await renderOrbitAnimation(
    renderer,
    scene,
    camera,
    distance,
    width,
    height
  )

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

  return { thumbnail, peaks, duration }
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
 * Compute an auto-exposure factor from HDR pixel data using log-average
 * luminance. This prevents the common problem of HDR images appearing
 * almost entirely white when tone-mapped without exposure adjustment.
 */
function computeAutoExposure(
  data: Float32Array | Float64Array,
  pixelCount: number,
  stride: number
): number {
  const DELTA = 1e-4 // avoid log(0)
  let logSum = 0
  let validCount = 0

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * stride
    const r = Math.abs(data[idx])
    const g = stride >= 3 ? Math.abs(data[idx + 1]) : r
    const b = stride >= 3 ? Math.abs(data[idx + 2]) : r
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    logSum += Math.log(lum + DELTA)
    validCount++
  }

  if (validCount === 0) return 1.0
  const logAvg = Math.exp(logSum / validCount)
  // Target mid-grey (0.18) divided by scene average
  const exposure = 0.18 / Math.max(logAvg, DELTA)
  // Clamp to a reasonable range
  return Math.max(0.01, Math.min(exposure, 20.0))
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

  const exposure = computeAutoExposure(data, width * height, pixelStride)

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
      const r = toneMapReinhard(exposure * data[srcIdx])
      const g = toneMapReinhard(exposure * data[srcIdx + 1])
      const b = toneMapReinhard(exposure * data[srcIdx + 2])

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
      const val = toneMapReinhard(exposure * data[srcIdx])
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
 * Parse an HDR (Radiance RGBE) blob and render a tone-mapped PNG preview.
 * Uses RGBELoader from three-stdlib (already a project dependency).
 */
export async function generateHdrChannelPreview(
  hdrBlob: Blob,
  channel: string = 'rgb'
): Promise<Blob> {
  const { RGBELoader } = await import('three-stdlib')
  const loader = new RGBELoader()

  const arrayBuffer = await hdrBlob.arrayBuffer()
  const hdrData = loader.parse(arrayBuffer)
  const { width, height, data } = hdrData

  const exposure = computeAutoExposure(data, width * height, 4)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)
  const pixels = imageData.data

  // RGBELoader outputs float data in RGBA layout (4 components per pixel)
  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * 4
    const dstIdx = i * 4

    const r = toneMapReinhard(exposure * data[srcIdx])
    const g = toneMapReinhard(exposure * data[srcIdx + 1])
    const b = toneMapReinhard(exposure * data[srcIdx + 2])

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
