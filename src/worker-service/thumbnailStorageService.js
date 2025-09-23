import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { ThumbnailApiService } from './thumbnailApiService.js';
import logger from './logger.js';

/**
 * Service for managing thumbnail storage via API upload instead of filesystem
 */
export class ThumbnailStorageService {
  constructor() {
    this.basePath = config.thumbnailStorage.basePath;
    this.enabled = config.thumbnailStorage.enabled;
    this.skipDuplicates = config.thumbnailStorage.skipDuplicates;
    this.apiService = new ThumbnailApiService();
    
    // Test API connection on startup
    if (this.enabled) {
      this.testApiConnection();
    }
  }

  /**
   * Test API connection
   */
  async testApiConnection() {
    try {
      const isConnected = await this.apiService.testConnection();
      if (isConnected) {
        logger.info('API connection test successful', { 
          apiBaseUrl: config.apiBaseUrl 
        });
      } else {
        logger.warn('API connection test failed, but service will continue', {
          apiBaseUrl: config.apiBaseUrl
        });
      }
    } catch (error) {
      logger.error('Error testing API connection', {
        apiBaseUrl: config.apiBaseUrl,
        error: error.message
      });
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
   * Since we're using API storage, we'll always return false to allow processing
   * The API backend will handle deduplication based on file hashes
   * @param {string} modelHash - The SHA256 hash of the model
   * @returns {Promise<Object>} Object with existence flags and file info
   */
  async checkThumbnailsExist(modelHash) {
    if (!this.enabled) {
      return { webpExists: false, posterExists: false, skipRendering: false };
    }

    try {
      logger.debug('Checking thumbnail existence via API (always allowing rendering)', {
        modelHash,
        skipDuplicates: this.skipDuplicates
      });

      // When using API storage, we let the backend handle deduplication
      // Always allow rendering since the API can handle duplicate uploads efficiently
      const result = {
        webpExists: false,
        posterExists: false,
        skipRendering: false, // Always render when using API
        paths: this.getThumbnailPaths(modelHash)
      };

      logger.debug('Thumbnail existence check completed', {
        modelHash,
        result
      });

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
   * Store generated thumbnail files by uploading to API
   * @param {string} modelHash - The SHA256 hash of the model
   * @param {string} webpSourcePath - Path to the generated WebP file
   * @param {string} posterSourcePath - Path to the generated poster file
   * @param {number} modelId - The model ID for API upload
   * @returns {Promise<Object>} Object with upload results and metadata
   */
  async storeThumbnails(modelHash, webpSourcePath, posterSourcePath, modelId = null) {
    if (!this.enabled) {
      logger.warn('Thumbnail storage is disabled, skipping API upload');
      return { stored: false, webpPath: null, posterPath: null };
    }

    try {
      logger.info('Starting API-based thumbnail storage', {
        modelHash,
        modelId,
        webpSourcePath,
        posterSourcePath
      });

      // Validate model ID
      if (!modelId) {
        throw new Error(`Model ID is required for API upload. Hash: ${modelHash}`);
      }

      // Upload thumbnails via API
      const uploadResult = await this.apiService.uploadMultipleThumbnails(modelId, {
        webpPath: webpSourcePath,
        posterPath: posterSourcePath
      });

      const results = {
        stored: uploadResult.allSuccessful,
        webpPath: webpSourcePath, // Keep original paths for reference
        posterPath: posterSourcePath,
        webpStored: false,
        posterStored: false,
        uploadResults: uploadResult.uploads,
        apiResponse: uploadResult
      };

      // Check individual upload results
      uploadResult.uploads.forEach(upload => {
        if (upload.type === 'webp' && upload.success) {
          results.webpStored = true;
        }
        if (upload.type === 'poster' && upload.success) {
          results.posterStored = true;
        }
      });

      logger.info('API-based thumbnail storage completed', {
        modelHash,
        modelId,
        stored: results.stored,
        webpStored: results.webpStored,
        posterStored: results.posterStored,
        totalUploads: uploadResult.uploads.length,
        allSuccessful: uploadResult.allSuccessful
      });

      return results;
    } catch (error) {
      logger.error('Failed to store thumbnails via API', {
        modelHash,
        modelId,
        webpSourcePath,
        posterSourcePath,
        error: error.message,
        stack: error.stack
      });
      
      // Return failed result but don't throw to allow job to continue
      return {
        stored: false,
        webpPath: null,
        posterPath: null,
        webpStored: false,
        posterStored: false,
        error: error.message
      };
    }
  }

  /**
   * Get model ID from model hash (no longer needed since we pass model ID directly)
   * @param {string} modelHash - The SHA256 hash of the model
   * @returns {Promise<number|null>} Model ID or null if not found
   */
  async getModelIdFromHash(modelHash) {
    logger.debug('getModelIdFromHash called but no longer needed', { modelHash });
    return null;
  }

  /**
   * Get metadata about stored thumbnails (not applicable for API storage)
   * @param {string} modelHash - The SHA256 hash of the model
   * @returns {Promise<Object>} Metadata about the stored thumbnails
   */
  async getThumbnailMetadata(modelHash) {
    return { 
      available: false, 
      message: 'Metadata not available for API-based storage',
      modelHash 
    };
  }

  /**
   * Clean up thumbnails for a specific model hash (not applicable for API storage)
   * @param {string} modelHash - The SHA256 hash of the model
   * @returns {Promise<boolean>} Success status
   */
  async cleanupThumbnails(modelHash) {
    logger.info('Cleanup not required for API-based storage', { modelHash });
    return true;
  }
}