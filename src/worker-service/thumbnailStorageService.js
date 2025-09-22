import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import logger from './logger.js';

/**
 * Service for managing persistent thumbnail storage with hash-based deduplication
 */
export class ThumbnailStorageService {
  constructor() {
    this.basePath = config.thumbnailStorage.basePath;
    this.enabled = config.thumbnailStorage.enabled;
    this.skipDuplicates = config.thumbnailStorage.skipDuplicates;
    
    if (this.enabled) {
      this.ensureStorageDirectory();
    }
  }

  /**
   * Ensure the thumbnail storage directory exists
   */
  ensureStorageDirectory() {
    try {
      if (!fs.existsSync(this.basePath)) {
        fs.mkdirSync(this.basePath, { recursive: true });
        logger.info('Created thumbnail storage directory', { basePath: this.basePath });
      }
    } catch (error) {
      logger.error('Failed to create thumbnail storage directory', {
        basePath: this.basePath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get the storage directory path for a specific model hash
   * @param {string} modelHash - The SHA256 hash of the model
   * @returns {string} Directory path for the model's thumbnails
   */
  getHashStorageDirectory(modelHash) {
    if (!this.enabled) {
      throw new Error('Thumbnail storage is not enabled');
    }
    
    // Use the model hash as the directory name for predictable paths
    return path.join(this.basePath, modelHash);
  }

  /**
   * Get the full paths for thumbnail files for a specific model hash
   * @param {string} modelHash - The SHA256 hash of the model
   * @returns {Object} Object containing paths for webp and poster files
   */
  getThumbnailPaths(modelHash) {
    const hashDir = this.getHashStorageDirectory(modelHash);
    
    return {
      webpPath: path.join(hashDir, 'orbit.webp'),
      posterPath: path.join(hashDir, 'poster.jpg'),
      directory: hashDir
    };
  }

  /**
   * Check if thumbnails already exist for a given model hash
   * @param {string} modelHash - The SHA256 hash of the model
   * @returns {Promise<Object>} Object with existence flags and file info
   */
  async checkThumbnailsExist(modelHash) {
    if (!this.enabled) {
      return { webpExists: false, posterExists: false, skipRendering: false };
    }

    try {
      const paths = this.getThumbnailPaths(modelHash);
      
      const webpExists = fs.existsSync(paths.webpPath);
      const posterExists = fs.existsSync(paths.posterPath);
      
      // Skip rendering if both files exist and skipDuplicates is enabled
      const skipRendering = this.skipDuplicates && webpExists && posterExists;
      
      const result = {
        webpExists,
        posterExists,
        skipRendering,
        paths
      };

      if (webpExists || posterExists) {
        logger.info('Found existing thumbnails', {
          modelHash,
          webpExists,
          posterExists,
          skipRendering,
          webpPath: paths.webpPath,
          posterPath: paths.posterPath
        });
      }

      return result;
    } catch (error) {
      logger.error('Error checking thumbnail existence', {
        modelHash,
        error: error.message
      });
      
      // Return false values on error to allow processing to continue
      return { webpExists: false, posterExists: false, skipRendering: false };
    }
  }

  /**
   * Store generated thumbnail files in persistent storage
   * @param {string} modelHash - The SHA256 hash of the model
   * @param {string} webpSourcePath - Path to the generated WebP file
   * @param {string} posterSourcePath - Path to the generated poster file
   * @returns {Promise<Object>} Object with final storage paths and metadata
   */
  async storeThumbnails(modelHash, webpSourcePath, posterSourcePath) {
    if (!this.enabled) {
      logger.warn('Thumbnail storage is disabled, skipping storage');
      return { stored: false, webpPath: null, posterPath: null };
    }

    try {
      const paths = this.getThumbnailPaths(modelHash);
      
      // Ensure the hash directory exists
      if (!fs.existsSync(paths.directory)) {
        fs.mkdirSync(paths.directory, { recursive: true });
        logger.debug('Created hash directory', { directory: paths.directory });
      }

      const results = {
        stored: true,
        webpPath: paths.webpPath,
        posterPath: paths.posterPath,
        webpStored: false,
        posterStored: false
      };

      // Copy WebP file if it exists and doesn't already exist in storage
      if (webpSourcePath && fs.existsSync(webpSourcePath)) {
        if (!fs.existsSync(paths.webpPath)) {
          fs.copyFileSync(webpSourcePath, paths.webpPath);
          results.webpStored = true;
          logger.debug('Stored WebP thumbnail', { 
            source: webpSourcePath, 
            destination: paths.webpPath 
          });
        } else {
          logger.debug('WebP thumbnail already exists in storage', { path: paths.webpPath });
        }
      }

      // Copy poster file if it exists and doesn't already exist in storage
      if (posterSourcePath && fs.existsSync(posterSourcePath)) {
        if (!fs.existsSync(paths.posterPath)) {
          fs.copyFileSync(posterSourcePath, paths.posterPath);
          results.posterStored = true;
          logger.debug('Stored poster thumbnail', { 
            source: posterSourcePath, 
            destination: paths.posterPath 
          });
        } else {
          logger.debug('Poster thumbnail already exists in storage', { path: paths.posterPath });
        }
      }

      logger.info('Thumbnail storage completed', {
        modelHash,
        webpStored: results.webpStored,
        posterStored: results.posterStored,
        webpPath: paths.webpPath,
        posterPath: paths.posterPath
      });

      return results;
    } catch (error) {
      logger.error('Failed to store thumbnails', {
        modelHash,
        webpSourcePath,
        posterSourcePath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get metadata about stored thumbnails
   * @param {string} modelHash - The SHA256 hash of the model
   * @returns {Promise<Object>} Metadata about the stored thumbnails
   */
  async getThumbnailMetadata(modelHash) {
    if (!this.enabled) {
      return { available: false };
    }

    try {
      const paths = this.getThumbnailPaths(modelHash);
      const metadata = { available: false, files: [] };

      if (fs.existsSync(paths.webpPath)) {
        const stats = fs.statSync(paths.webpPath);
        metadata.files.push({
          type: 'webp',
          path: paths.webpPath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }

      if (fs.existsSync(paths.posterPath)) {
        const stats = fs.statSync(paths.posterPath);
        metadata.files.push({
          type: 'poster',
          path: paths.posterPath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }

      metadata.available = metadata.files.length > 0;
      return metadata;
    } catch (error) {
      logger.error('Error getting thumbnail metadata', {
        modelHash,
        error: error.message
      });
      return { available: false, error: error.message };
    }
  }

  /**
   * Clean up thumbnails for a specific model hash
   * @param {string} modelHash - The SHA256 hash of the model
   * @returns {Promise<boolean>} Success status
   */
  async cleanupThumbnails(modelHash) {
    if (!this.enabled) {
      return false;
    }

    try {
      const paths = this.getThumbnailPaths(modelHash);
      
      if (fs.existsSync(paths.directory)) {
        fs.rmSync(paths.directory, { recursive: true, force: true });
        logger.info('Cleaned up thumbnails', { modelHash, directory: paths.directory });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error cleaning up thumbnails', {
        modelHash,
        error: error.message
      });
      return false;
    }
  }
}