// Utility functions for file handling

/**
 * Interface representing a file in a model
 */
export interface ModelFile {
  id: string
  originalFileName: string
  storedFileName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  sha256Hash: string
  fileType: string
  isRenderable: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Interface representing a model
 */
export interface Model {
  id: string
  name: string
  description?: string
  tags?: string
  files: ModelFile[]
  createdAt: string
  updatedAt: string
  textureSets?: { id: number; name: string }[]
  packs?: { id: number; name: string }[]
}

/**
 * Get file extension from file path or name
 */
export function getFileExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() || 'unknown'
}

/**
 * Get file name from path
 */
export function getFileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || 'unknown'
}

/**
 * Get display format from model files
 */
export function getModelFileFormat(model: Model): string {
  if (model.files && model.files.length > 0) {
    return getFileExtension(model.files[0].originalFileName).toUpperCase()
  }
  return 'UNKNOWN'
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Three.js supported file formats that can be rendered
 */
export const THREEJS_SUPPORTED_FORMATS = [
  '.obj', // OBJLoader
  '.fbx', // FBXLoader
  '.gltf', // GLTFLoader
  '.glb', // GLTFLoader
] as const

/**
 * All supported 3D model file formats
 */
export const ALL_SUPPORTED_FORMATS = [
  '.obj',
  '.fbx',
  '.dae',
  '.3ds',
  '.blend',
  '.gltf',
  '.glb',
] as const

/**
 * Check if file extension is supported by Three.js loaders
 */
export function isThreeJSRenderable(fileExtension: string): boolean {
  const ext = fileExtension.startsWith('.')
    ? fileExtension.toLowerCase()
    : '.' + fileExtension.toLowerCase()

  return (THREEJS_SUPPORTED_FORMATS as readonly string[]).includes(ext)
}

/**
 * Check if file extension is a supported 3D model format
 */
export function isSupportedModelFormat(fileExtension: string): boolean {
  const ext = fileExtension.startsWith('.')
    ? fileExtension.toLowerCase()
    : '.' + fileExtension.toLowerCase()

  return (ALL_SUPPORTED_FORMATS as readonly string[]).includes(ext)
}
