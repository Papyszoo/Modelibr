#!/usr/bin/env node
/**
 * Generates the tiny animated glTF fixtures that pin the loader/scene-graph
 * contract for animation clips, morph targets, vertex colours and textures.
 *
 * Run: node test/fixtures/animated/generate.mjs
 *
 * No dependency and no Blender: every file is a single .gltf JSON document with
 * one embedded base64 buffer, and the textured fixtures carry their 4x4 PNGs as
 * data URIs. Regenerating reproduces byte-identical files - the tests load the
 * committed artefacts, this script is how they were made.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = dirname(fileURLToPath(import.meta.url))

const FLOAT = 5126
const UNSIGNED_SHORT = 5123
const UNSIGNED_BYTE = 5121
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const COMPONENT_BYTES = {
  [FLOAT]: 4,
  [UNSIGNED_SHORT]: 2,
  [UNSIGNED_BYTE]: 1,
}

// ---- binary buffer ----------------------------------------------------------

/** Concatenates typed arrays, padding each entry to a 4-byte boundary. */
class BinaryBuffer {
  constructor() {
    this.parts = []
    this.length = 0
  }

  add(buffer) {
    const pad = (4 - (this.length % 4)) % 4
    if (pad > 0) {
      this.parts.push(Buffer.alloc(pad))
      this.length += pad
    }
    const byteOffset = this.length
    this.parts.push(buffer)
    this.length += buffer.length
    return { byteOffset, byteLength: buffer.length }
  }

  toBuffer() {
    return Buffer.concat(this.parts, this.length)
  }
}

function floats(values) {
  const buffer = Buffer.alloc(values.length * 4)
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4))
  return buffer
}

function ushorts(values) {
  const buffer = Buffer.alloc(values.length * 2)
  values.forEach((value, index) => buffer.writeUInt16LE(value, index * 2))
  return buffer
}

// ---- glTF document builder --------------------------------------------------

class GltfBuilder {
  constructor() {
    this.doc = {
      asset: {
        version: '2.0',
        generator: 'Modelibr animated fixture generator',
      },
      scene: 0,
      scenes: [{ nodes: [] }],
    }
    this.bin = new BinaryBuffer()
    this.bufferViews = []
    this.accessors = []
  }

  accessor(data, componentType, type, { target, min, max } = {}) {
    const view = this.bin.add(data)
    const bufferView = this.bufferViews.length
    this.bufferViews.push({
      buffer: 0,
      byteOffset: view.byteOffset,
      byteLength: view.byteLength,
      ...(target === undefined ? {} : { target }),
    })
    const index = this.accessors.length
    this.accessors.push({
      bufferView,
      componentType,
      count: data.length / (COMPONENT_BYTES[componentType] * COMPONENTS[type]),
      type,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
    })
    return index
  }

  finish() {
    const buffer = this.bin.toBuffer()
    return {
      ...this.doc,
      buffers: [
        {
          byteLength: buffer.length,
          uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`,
        },
      ],
      bufferViews: this.bufferViews,
      accessors: this.accessors,
    }
  }
}

// ---- shared box data --------------------------------------------------------

// A centred unit cube: 8 vertices, 12 triangles, one colour and one UV per vertex.
const POSITIONS = [
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5,
  -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
]
const NORMALS = [
  -0.577, -0.577, -0.577, 0.577, -0.577, -0.577, 0.577, 0.577, -0.577, -0.577,
  0.577, -0.577, -0.577, -0.577, 0.577, 0.577, -0.577, 0.577, 0.577, 0.577,
  0.577, -0.577, 0.577, 0.577,
]
const INDICES = [
  0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3,
  7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
]
const UVS = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]
const COLORS = [
  1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1,
  1, 1, 0.5, 0.5, 0.5, 1,
]

// Two joints, each vertex fully bound to the joint nearest its side. One VEC4
// per vertex (8 vertices x 4 components), matching JOINT_WEIGHTS below - a
// short array here makes the accessor count smaller than POSITION and the
// viewer's bounding-box pass reads past the end (bone undefined -> crash).
const JOINT_INDICES = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0,
  0, 0, 1, 0, 0, 0,
]
const JOINT_WEIGHTS = [
  1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0,
  0, 0, 1, 0, 0, 0,
]
const INVERSE_BIND_MATRICES = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0,
  1, 0, 0, -0.5, 0, 1,
]

// Squash halves Y, Stretch grows it: deltas are authoring-style morph targets.
const SQUASH_DELTAS = POSITIONS.map((value, index) =>
  index % 3 === 1 ? value * -0.5 : 0
)
const STRETCH_DELTAS = POSITIONS.map((value, index) =>
  index % 3 === 1 ? value * 0.5 : 0
)

const WAVE_TIMES = [0, 0.5, 1]
const WAVE_QUATERNIONS = [
  0,
  0,
  0,
  1,
  0,
  0,
  Math.SQRT1_2,
  Math.SQRT1_2,
  0,
  0,
  0,
  1,
]
const PULSE_TIMES = [0, 1, 2]
const PULSE_WEIGHTS = [0, 0, 1, 0.5, 0, 0]

// ---- 4x4 PNGs ---------------------------------------------------------------

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, checksum])
}

/** A 4x4 RGBA PNG whose pixels come from `pixel(x, y) -> [r, g, b]`. */
function tinyPng(pixel) {
  const width = 4
  const height = 4
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4)
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      const offset = row + 1 + x * 4
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = 255
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const BASE_COLOR_PNG = tinyPng((x, y) =>
  (x + y) % 2 === 0 ? [232, 145, 60] : [66, 92, 138]
)
const FLAT_NORMAL_PNG = tinyPng(() => [128, 128, 255])

function dataUri(png) {
  return `data:image/png;base64,${png.toString('base64')}`
}

const TEXTURED_MATERIAL = {
  name: 'BoxMat',
  pbrMetallicRoughness: {
    baseColorTexture: { index: 0 },
    metallicFactor: 0,
    roughnessFactor: 0.8,
  },
  normalTexture: { index: 1 },
}

const TEXTURES = [
  { source: 0, sampler: 0 },
  { source: 1, sampler: 0 },
]
const IMAGES = [
  { name: 'BoxBaseColor', uri: dataUri(BASE_COLOR_PNG) },
  { name: 'BoxNormal', uri: dataUri(FLAT_NORMAL_PNG) },
]
const SAMPLERS = [
  { magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 },
]

// ---- builders ---------------------------------------------------------------

function boxAttributes(
  builder,
  { withUv = false, withColor = false, withSkin = false } = {}
) {
  const attributes = {
    POSITION: builder.accessor(floats(POSITIONS), FLOAT, 'VEC3', {
      target: ARRAY_BUFFER,
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5],
    }),
    NORMAL: builder.accessor(floats(NORMALS), FLOAT, 'VEC3', {
      target: ARRAY_BUFFER,
    }),
  }
  if (withUv) {
    attributes.TEXCOORD_0 = builder.accessor(floats(UVS), FLOAT, 'VEC2', {
      target: ARRAY_BUFFER,
    })
  }
  if (withColor) {
    attributes.COLOR_0 = builder.accessor(floats(COLORS), FLOAT, 'VEC4', {
      target: ARRAY_BUFFER,
    })
  }
  if (withSkin) {
    attributes.JOINTS_0 = builder.accessor(
      Buffer.from(JOINT_INDICES),
      UNSIGNED_BYTE,
      'VEC4',
      { target: ARRAY_BUFFER }
    )
    attributes.WEIGHTS_0 = builder.accessor(
      floats(JOINT_WEIGHTS),
      FLOAT,
      'VEC4',
      {
        target: ARRAY_BUFFER,
      }
    )
  }
  return attributes
}

/** Exact per-component min/max of a VEC3 list - POSITION accessors require them. */
function bounds(values) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < values.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], values[index + axis])
      max[axis] = Math.max(max[axis], values[index + axis])
    }
  }
  return { min, max }
}

function boxMorphTargets(builder) {
  return [
    {
      POSITION: builder.accessor(floats(SQUASH_DELTAS), FLOAT, 'VEC3', {
        target: ARRAY_BUFFER,
        ...bounds(SQUASH_DELTAS),
      }),
    },
    {
      POSITION: builder.accessor(floats(STRETCH_DELTAS), FLOAT, 'VEC3', {
        target: ARRAY_BUFFER,
        ...bounds(STRETCH_DELTAS),
      }),
    },
  ]
}

function boxMesh(
  builder,
  {
    withUv = false,
    withColor = false,
    withSkin = false,
    withMorph = false,
    material = false,
  } = {}
) {
  const attributes = boxAttributes(builder, { withUv, withColor, withSkin })
  const primitive = {
    attributes,
    indices: builder.accessor(ushorts(INDICES), UNSIGNED_SHORT, 'SCALAR', {
      target: ELEMENT_ARRAY_BUFFER,
    }),
  }
  if (withMorph) {
    primitive.targets = boxMorphTargets(builder)
  }
  if (material) {
    primitive.material = 0
  }
  const mesh = { name: 'Box', primitives: [primitive] }
  if (withMorph) {
    mesh.weights = [0, 0]
    mesh.extras = { targetNames: ['Squash', 'Stretch'] }
  }
  return mesh
}

function waveAnimation(builder, targetNode) {
  return {
    name: 'Wave',
    channels: [{ sampler: 0, target: { node: targetNode, path: 'rotation' } }],
    samplers: [
      {
        input: builder.accessor(floats(WAVE_TIMES), FLOAT, 'SCALAR', {
          target: ARRAY_BUFFER,
          min: [0],
          max: [1],
        }),
        output: builder.accessor(floats(WAVE_QUATERNIONS), FLOAT, 'VEC4', {
          target: ARRAY_BUFFER,
        }),
        interpolation: 'LINEAR',
      },
    ],
  }
}

function pulseAnimation(builder, targetNode) {
  return {
    name: 'Pulse',
    channels: [{ sampler: 0, target: { node: targetNode, path: 'weights' } }],
    samplers: [
      {
        input: builder.accessor(floats(PULSE_TIMES), FLOAT, 'SCALAR', {
          target: ARRAY_BUFFER,
          min: [0],
          max: [2],
        }),
        output: builder.accessor(floats(PULSE_WEIGHTS), FLOAT, 'SCALAR', {
          target: ARRAY_BUFFER,
        }),
        interpolation: 'LINEAR',
      },
    ],
  }
}

function skin(builder) {
  return {
    name: 'Rig',
    joints: [1, 2],
    skeleton: 1,
    inverseBindMatrices: builder.accessor(
      floats(INVERSE_BIND_MATRICES),
      FLOAT,
      'MAT4',
      { target: ARRAY_BUFFER }
    ),
  }
}

// ---- fixtures ---------------------------------------------------------------

function skinnedClip() {
  const builder = new GltfBuilder()
  const doc = builder.doc
  doc.meshes = [boxMesh(builder, { withSkin: true })]
  doc.skins = [skin(builder)]
  doc.nodes = [
    { name: 'Skeleton', children: [1] },
    { name: 'Joint_Root', children: [2] },
    { name: 'Joint_Child', translation: [0, 0.5, 0] },
    { name: 'Box', mesh: 0, skin: 0 },
  ]
  doc.scenes[0].nodes = [0, 3]
  doc.animations = [waveAnimation(builder, 2)]
  return builder.finish()
}

function morphClip() {
  const builder = new GltfBuilder()
  const doc = builder.doc
  doc.meshes = [boxMesh(builder, { withMorph: true })]
  doc.nodes = [{ name: 'Box', mesh: 0 }]
  doc.scenes[0].nodes = [0]
  doc.animations = [pulseAnimation(builder, 0)]
  return builder.finish()
}

function vertexColors() {
  const builder = new GltfBuilder()
  const doc = builder.doc
  doc.meshes = [boxMesh(builder, { withColor: true })]
  doc.nodes = [{ name: 'Box', mesh: 0 }]
  doc.scenes[0].nodes = [0]
  return builder.finish()
}

function textured() {
  const builder = new GltfBuilder()
  const doc = builder.doc
  doc.meshes = [boxMesh(builder, { withUv: true, material: true })]
  doc.materials = [TEXTURED_MATERIAL]
  doc.textures = TEXTURES
  doc.images = IMAGES
  doc.samplers = SAMPLERS
  doc.nodes = [{ name: 'Box', mesh: 0 }]
  doc.scenes[0].nodes = [0]
  return builder.finish()
}

function combined() {
  const builder = new GltfBuilder()
  const doc = builder.doc
  doc.meshes = [
    boxMesh(builder, {
      withUv: true,
      withColor: true,
      withSkin: true,
      withMorph: true,
      material: true,
    }),
  ]
  doc.materials = [TEXTURED_MATERIAL]
  doc.textures = TEXTURES
  doc.images = IMAGES
  doc.samplers = SAMPLERS
  doc.skins = [skin(builder)]
  doc.nodes = [
    { name: 'Skeleton', children: [1] },
    { name: 'Joint_Root', children: [2] },
    { name: 'Joint_Child', translation: [0, 0.5, 0] },
    { name: 'Box', mesh: 0, skin: 0 },
  ]
  doc.scenes[0].nodes = [0, 3]
  doc.animations = [waveAnimation(builder, 2), pulseAnimation(builder, 3)]
  return builder.finish()
}

const FIXTURES = {
  'skinned-clip.gltf': skinnedClip,
  'morph-clip.gltf': morphClip,
  'vertex-colors.gltf': vertexColors,
  'textured.gltf': textured,
  'combined.gltf': combined,
}

for (const [name, build] of Object.entries(FIXTURES)) {
  const path = join(OUT_DIR, name)
  writeFileSync(path, `${JSON.stringify(build(), null, 2)}\n`)
  console.log(`wrote ${path}`)
}
