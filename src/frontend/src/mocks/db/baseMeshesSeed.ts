/**
 * "Base Meshes (CC0)" demo pack — a curated subset of the base-meshes content
 * repo, served remotely so no binaries live in this repository.
 *
 * Credits: meshes by The Base Mesh (https://www.thebasemesh.com/, CC0 1.0),
 * glTF conversion by https://github.com/M3-org/base-meshes, thumbnails
 * rendered with Modelibr's own asset-processor pipeline in the fork
 * https://github.com/Papyszoo/CC0-Public-Domain-Models.
 *
 * URLs are pinned to a commit SHA so upstream pushes can never break the demo.
 * That commit predates the repo's packs/<slug>/ reorganisation, so the path
 * below is still `models/…` — a pinned URL always describes the tree as it was
 * at that commit, and GitHub keeps serving it under the current repo name.
 * Each model folder provides `{name}.glb` plus pipeline-identical thumbnails
 * (`{name}.webp` animated turntable, `{name}.png` static fallback).
 */
import type { DemoModel, DemoModelVersion, DemoPack } from './demoDb'

export const BASE_MESHES_COMMIT = '792e14d4f80d6345c2382d13c17dd9f862fb3a75'

const RAW_BASE = `https://raw.githubusercontent.com/Papyszoo/CC0-Public-Domain-Models/${BASE_MESHES_COMMIT}/models`

export const BASE_MESHES_PACK_ID = 3

// Seeded ids live far above the demo id sequences (which start at 100) so
// user-created entities can never collide with them.
const MODEL_ID_BASE = 7000
const FILE_ID_BASE = 7000
const VERSION_ID_BASE = 7000

interface BaseMeshEntry {
  name: string
  sizeBytes: number
}

// Curated subset (54 of ~900); sizes are the real GLB byte counts.
const BASE_MESHES: BaseMeshEntry[] = [
  { name: 'anvil', sizeBytes: 27964 },
  { name: 'axe', sizeBytes: 22292 },
  { name: 'battle_axe', sizeBytes: 46272 },
  { name: 'bronze_age_sword', sizeBytes: 59844 },
  { name: 'dagger', sizeBytes: 23600 },
  { name: 'halberd', sizeBytes: 26776 },
  { name: 'round_shield', sizeBytes: 48880 },
  { name: 'breastplate_armour_01', sizeBytes: 52256 },
  { name: 'iron_brazier_01', sizeBytes: 69384 },
  { name: 'iron_chandelier', sizeBytes: 753100 },
  { name: 'goblet_01', sizeBytes: 41444 },
  { name: 'scroll_01', sizeBytes: 19976 },
  { name: 'ornate_key', sizeBytes: 75616 },
  { name: 'padlock', sizeBytes: 28780 },
  { name: 'wood_barrel', sizeBytes: 133692 },
  { name: 'wooden_crate_01', sizeBytes: 62624 },
  { name: 'wooden_ladder', sizeBytes: 16212 },
  { name: 'japanese_stone_lantern_01', sizeBytes: 58916 },
  { name: 'torii_gate_01', sizeBytes: 29140 },
  { name: 'greek_column_02', sizeBytes: 225040 },
  { name: 'greek_vase_01', sizeBytes: 80784 },
  { name: 'obelisk_01', sizeBytes: 5004 },
  { name: 'headstone_01', sizeBytes: 5208 },
  { name: 'stone_archway_01', sizeBytes: 9640 },
  { name: 'oil_barrel', sizeBytes: 99484 },
  { name: 'traffic_cone_01', sizeBytes: 28388 },
  { name: 'pallet', sizeBytes: 27760 },
  { name: 'crowbar', sizeBytes: 17068 },
  { name: 'sledgehammer', sizeBytes: 31780 },
  { name: 'pick_axe', sizeBytes: 22300 },
  { name: 'shovel_01', sizeBytes: 62404 },
  { name: 'lamp_post_01', sizeBytes: 139956 },
  { name: 'park_bench', sizeBytes: 71556 },
  { name: 'retro_tv', sizeBytes: 239692 },
  { name: 'retro_computer', sizeBytes: 65280 },
  { name: 'vintage_phone', sizeBytes: 473288 },
  { name: 'computer_keyboard', sizeBytes: 107104 },
  { name: 'computer_mouse_01', sizeBytes: 17808 },
  { name: 'microwave', sizeBytes: 73572 },
  { name: 'piano', sizeBytes: 467348 },
  { name: 'electric_guitar', sizeBytes: 2388052 },
  { name: 'acoustic_guitar', sizeBytes: 366932 },
  { name: 'skateboard_setup', sizeBytes: 1289036 },
  { name: 'globe', sizeBytes: 50636 },
  { name: 'wall_clock', sizeBytes: 20040 },
  { name: 'wine_bottle', sizeBytes: 26088 },
  { name: 'mug', sizeBytes: 29464 },
  { name: 'teapot', sizeBytes: 129812 },
  { name: 'deer_head', sizeBytes: 38424 },
  { name: 'ship_wheel', sizeBytes: 620828 },
  { name: 'd20_dice', sizeBytes: 11048 },
  { name: 'health', sizeBytes: 13180 },
  { name: 'question_mark', sizeBytes: 11396 },
  { name: 'location_marker', sizeBytes: 6948 },
]

const glbUrl = (name: string) => `${RAW_BASE}/${name}/${name}.glb`
const webpUrl = (name: string) => `${RAW_BASE}/${name}/${name}.webp`

const displayName = (name: string) =>
  name
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const modelId = (index: number) => MODEL_ID_BASE + index + 1
const fileId = (index: number) => FILE_ID_BASE + index + 1
const versionId = (index: number) => VERSION_ID_BASE + index + 1

/** fileId → absolute GLB URL, merged into the seed static-asset map. */
export function baseMeshFileAssets(): Record<number, string> {
  const map: Record<number, string> = {}
  BASE_MESHES.forEach((entry, index) => {
    map[fileId(index)] = glbUrl(entry.name)
  })
  return map
}

/**
 * entityKey ("model:{id}" / "version:{id}") → remote animated-WebP thumbnail.
 * Served instead of generating a thumbnail in the browser.
 */
export function baseMeshRemoteThumbnails(): Record<string, string> {
  const map: Record<string, string> = {}
  BASE_MESHES.forEach((entry, index) => {
    map[`model:${modelId(index)}`] = webpUrl(entry.name)
    map[`version:${versionId(index)}`] = webpUrl(entry.name)
  })
  return map
}

export function buildBaseMeshSeed(now: string): {
  models: DemoModel[]
  versions: DemoModelVersion[]
  pack: DemoPack
} {
  const packRef = { id: BASE_MESHES_PACK_ID, name: 'Base Meshes (CC0)' }

  const models: DemoModel[] = BASE_MESHES.map((entry, index) => ({
    id: modelId(index),
    name: displayName(entry.name),
    description: `CC0 base mesh from thebasemesh.com (via M3-org/base-meshes).`,
    tags: ['cc0', 'base mesh'],
    files: [
      {
        id: fileId(index),
        originalFileName: `${entry.name}.glb`,
        storedFileName: `${entry.name}.glb`,
        filePath: `${entry.name}.glb`,
        mimeType: 'model/gltf-binary',
        sizeBytes: entry.sizeBytes,
        sha256Hash: `base-mesh-${entry.name}`,
        fileType: 'glb',
        isRenderable: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    activeVersionId: versionId(index),
    defaultTextureSetId: null,
    categoryId: null,
    conceptImages: [],
    textureSets: [],
    packs: [packRef],
    projects: [],
  }))

  const versions: DemoModelVersion[] = BASE_MESHES.map((entry, index) => ({
    id: versionId(index),
    modelId: modelId(index),
    versionNumber: 1,
    description: 'Imported from Base Meshes (CC0)',
    createdAt: now,
    defaultTextureSetId: null,
    thumbnailUrl: null,
    pngThumbnailUrl: null,
    files: [
      {
        id: fileId(index),
        originalFileName: `${entry.name}.glb`,
        mimeType: 'model/gltf-binary',
        fileType: 'glb',
        sizeBytes: entry.sizeBytes,
        isRenderable: true,
      },
    ],
    materialNames: [],
    mainVariantName: '',
    variantNames: [],
    textureMappings: [],
    textureSetIds: [],
  }))

  const pack: DemoPack = {
    id: BASE_MESHES_PACK_ID,
    name: packRef.name,
    description:
      'CC0 base meshes by The Base Mesh (thebasemesh.com), converted to glTF ' +
      'by the M3-org/base-meshes project. Real-world scale with basic UVs — ' +
      'free for any use, no attribution required.',
    licenseType: 'CC0',
    url: 'https://www.thebasemesh.com/',
    createdAt: now,
    updatedAt: now,
    modelCount: models.length,
    globalMaterialCount: 0,
    multiModelTextureCount: 0,
    spriteCount: 0,
    soundCount: 0,
    scriptCount: 0,
    environmentMapCount: 0,
    isEmpty: false,
    customThumbnailFileId: null,
    customThumbnailUrl: null,
    models: models.map(m => ({ id: m.id, name: m.name })),
    textureSets: [],
    sprites: [],
    sounds: [],
    scripts: [],
    environmentMaps: [],
  }

  return { models, versions, pack }
}
