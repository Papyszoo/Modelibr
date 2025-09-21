// Utility functions for file handling

/**
 * Get file extension from file path or name
 * @param {string} filePath - File path or name
 * @returns {string} File extension in lowercase
 */
export function getFileExtension(filePath) {
  return filePath.split('.').pop()?.toLowerCase() || 'unknown'
}

/**
 * Get file name from path
 * @param {string} filePath - File path
 * @returns {string} File name
 */
export function getFileName(filePath) {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || 'unknown'
}

/**
 * Get display format from model files
 * @param {Object} model - Model object with files array
 * @returns {string} Formatted file extension for display
 */
export function getModelFileFormat(model) {
  if (model.files && model.files.length > 0) {
    return getFileExtension(model.files[0].originalFileName).toUpperCase()
  }
  return 'UNKNOWN'
}

/**
 * Format file size in human readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
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
  '.obj',   // OBJLoader
  '.gltf',  // GLTFLoader
  '.glb'    // GLTFLoader
]

/**
 * All supported 3D model file formats
 */
export const ALL_SUPPORTED_FORMATS = [
  '.obj', '.fbx', '.dae', '.3ds', '.blend', '.gltf', '.glb'
]

/**
 * Check if file extension is supported by Three.js loaders
 * @param {string} fileExtension - File extension (with or without dot)
 * @returns {boolean} True if Three.js can render this format
 */
export function isThreeJSRenderable(fileExtension) {
  const ext = fileExtension.startsWith('.') 
    ? fileExtension.toLowerCase() 
    : '.' + fileExtension.toLowerCase()
  
  return THREEJS_SUPPORTED_FORMATS.includes(ext)
}

/**
 * Check if file extension is a supported 3D model format
 * @param {string} fileExtension - File extension (with or without dot)
 * @returns {boolean} True if it's a supported format
 */
export function isSupportedModelFormat(fileExtension) {
  const ext = fileExtension.startsWith('.') 
    ? fileExtension.toLowerCase() 
    : '.' + fileExtension.toLowerCase()
  
  return ALL_SUPPORTED_FORMATS.includes(ext)
}