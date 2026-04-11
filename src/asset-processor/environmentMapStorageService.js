import fs from 'fs'
import path from 'path'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Stores generated environment map thumbnails into the shared uploads tree.
 * The backend finish contract persists only the relative thumbnail path.
 */
export class EnvironmentMapStorageService {
  constructor() {
    this.uploadRootPath = config.environmentMaps.uploadRootPath
  }

  getVariantDirectory(environmentMapId) {
    return path.join(
      this.uploadRootPath,
      'previews',
      'environment-maps',
      environmentMapId.toString()
    )
  }

  getVariantThumbnailPaths(environmentMapId, variantId) {
    const directory = this.getVariantDirectory(environmentMapId)
    return {
      directory,
      webpAbsolutePath: path.join(directory, `${variantId}.webp`),
      pngAbsolutePath: path.join(directory, `${variantId}.png`),
      webpRelativePath: path
        .join(
          'previews',
          'environment-maps',
          environmentMapId.toString(),
          `${variantId}.webp`
        )
        .replaceAll(path.sep, '/'),
      pngRelativePath: path
        .join(
          'previews',
          'environment-maps',
          environmentMapId.toString(),
          `${variantId}.png`
        )
        .replaceAll(path.sep, '/'),
    }
  }

  async storeThumbnail(environmentMapId, variantId, encodingResult) {
    if (!this.uploadRootPath) {
      throw new Error(
        'Environment map upload root path is not configured (UPLOAD_STORAGE_PATH)'
      )
    }

    if (!encodingResult?.webpPath || !fs.existsSync(encodingResult.webpPath)) {
      throw new Error('Encoded WebP thumbnail file was not found')
    }

    const paths = this.getVariantThumbnailPaths(environmentMapId, variantId)
    fs.mkdirSync(this.uploadRootPath, { recursive: true })
    fs.mkdirSync(paths.directory, { recursive: true })

    fs.copyFileSync(encodingResult.webpPath, paths.webpAbsolutePath)

    if (encodingResult.pngPath && fs.existsSync(encodingResult.pngPath)) {
      fs.copyFileSync(encodingResult.pngPath, paths.pngAbsolutePath)
    }

    const stats = fs.statSync(paths.webpAbsolutePath)
    logger.info('Stored environment map thumbnail to shared uploads path', {
      environmentMapId,
      variantId,
      webpAbsolutePath: paths.webpAbsolutePath,
      webpRelativePath: paths.webpRelativePath,
      sizeBytes: stats.size,
    })

    return {
      thumbnailPath: paths.webpRelativePath,
      sizeBytes: stats.size,
      width: config.rendering.outputWidth,
      height: config.rendering.outputHeight,
      previewPngPath: fs.existsSync(paths.pngAbsolutePath)
        ? paths.pngRelativePath
        : null,
    }
  }
}
