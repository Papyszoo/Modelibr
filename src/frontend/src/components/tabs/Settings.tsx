import { useState, useEffect } from 'react'
// eslint-disable-next-line no-restricted-imports -- Settings component needs direct API access for system configuration
import apiClient from '../../services/ApiClient'
import './Settings.css'

interface SettingsData {
  maxFileSizeBytes: number
  maxThumbnailSizeBytes: number
  thumbnailFrameCount: number
  thumbnailCameraVerticalAngle: number
  thumbnailWidth: number
  thumbnailHeight: number
  generateThumbnailOnUpload: boolean
}

function Settings(): JSX.Element {
  const [_settings, setSettings] = useState<SettingsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Accordion state
  const [activeIndex, setActiveIndex] = useState<number | number[]>([0, 1])

  // Original values from server (for dirty tracking)
  const [originalValues, setOriginalValues] = useState<{
    maxFileSizeMB: number
    maxThumbnailSizeMB: number
    thumbnailFrameCount: number
    thumbnailCameraAngle: number
    thumbnailWidth: number
    thumbnailHeight: number
    generateThumbnailOnUpload: boolean
  } | null>(null)

  // Form state
  const [maxFileSizeMB, setMaxFileSizeMB] = useState<number>(1024)
  const [maxThumbnailSizeMB, setMaxThumbnailSizeMB] = useState<number>(10)
  const [thumbnailFrameCount, setThumbnailFrameCount] = useState<number>(30)
  const [thumbnailCameraAngle, setThumbnailCameraAngle] = useState<number>(0.75)
  const [thumbnailWidth, setThumbnailWidth] = useState<number>(256)
  const [thumbnailHeight, setThumbnailHeight] = useState<number>(256)
  const [generateThumbnailOnUpload, setGenerateThumbnailOnUpload] =
    useState<boolean>(true)

  // Validation errors state
  const [validationErrors, setValidationErrors] = useState<{
    maxFileSizeMB?: string
    maxThumbnailSizeMB?: string
    thumbnailFrameCount?: string
    thumbnailCameraAngle?: string
    thumbnailWidth?: string
    thumbnailHeight?: string
  }>({})

  useEffect(() => {
    fetchSettings()
  }, [])

  // Validation functions
  const validateMaxFileSizeMB = (value: number): string | undefined => {
    if (isNaN(value) || value < 1) return 'Must be at least 1 MB'
    if (value > 10240) return 'Cannot exceed 10240 MB (10 GB)'
    return undefined
  }

  const validateMaxThumbnailSizeMB = (value: number): string | undefined => {
    if (isNaN(value) || value < 1) return 'Must be at least 1 MB'
    if (value > 100) return 'Cannot exceed 100 MB'
    return undefined
  }

  const validateThumbnailFrameCount = (value: number): string | undefined => {
    if (isNaN(value) || value < 1) return 'Must be at least 1 frame'
    if (value > 360) return 'Cannot exceed 360 frames'
    return undefined
  }

  const validateThumbnailCameraAngle = (value: number): string | undefined => {
    if (isNaN(value) || value < 0) return 'Cannot be negative'
    if (value > 2) return 'Cannot exceed 2'
    return undefined
  }

  const validateThumbnailWidth = (value: number): string | undefined => {
    if (isNaN(value) || value < 64) return 'Must be at least 64 pixels'
    if (value > 2048) return 'Cannot exceed 2048 pixels'
    return undefined
  }

  const validateThumbnailHeight = (value: number): string | undefined => {
    if (isNaN(value) || value < 64) return 'Must be at least 64 pixels'
    if (value > 2048) return 'Cannot exceed 2048 pixels'
    return undefined
  }

  // Check if field is dirty (changed from original)
  const isFieldDirty = (fieldName: string): boolean => {
    if (!originalValues) return false

    switch (fieldName) {
      case 'maxFileSizeMB':
        return maxFileSizeMB !== originalValues.maxFileSizeMB
      case 'maxThumbnailSizeMB':
        return maxThumbnailSizeMB !== originalValues.maxThumbnailSizeMB
      case 'thumbnailFrameCount':
        return thumbnailFrameCount !== originalValues.thumbnailFrameCount
      case 'thumbnailCameraAngle':
        return thumbnailCameraAngle !== originalValues.thumbnailCameraAngle
      case 'thumbnailWidth':
        return thumbnailWidth !== originalValues.thumbnailWidth
      case 'thumbnailHeight':
        return thumbnailHeight !== originalValues.thumbnailHeight
      case 'generateThumbnailOnUpload':
        return (
          generateThumbnailOnUpload !== originalValues.generateThumbnailOnUpload
        )
      default:
        return false
    }
  }

  // Check if form has any changes
  const hasChanges = (): boolean => {
    return (
      isFieldDirty('maxFileSizeMB') ||
      isFieldDirty('maxThumbnailSizeMB') ||
      isFieldDirty('thumbnailFrameCount') ||
      isFieldDirty('thumbnailCameraAngle') ||
      isFieldDirty('thumbnailWidth') ||
      isFieldDirty('thumbnailHeight') ||
      isFieldDirty('generateThumbnailOnUpload')
    )
  }

  // Check if form has any validation errors
  const hasValidationErrors = (): boolean => {
    return Object.keys(validationErrors).length > 0
  }

  const fetchSettings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiClient.getSettings()
      setSettings(data)

      // Update form state with fetched values
      const fileSizeMB = Math.round(data.maxFileSizeBytes / 1_048_576)
      const thumbnailSizeMB = Math.round(data.maxThumbnailSizeBytes / 1_048_576)

      setMaxFileSizeMB(fileSizeMB)
      setMaxThumbnailSizeMB(thumbnailSizeMB)
      setThumbnailFrameCount(data.thumbnailFrameCount)
      setThumbnailCameraAngle(data.thumbnailCameraVerticalAngle)
      setThumbnailWidth(data.thumbnailWidth)
      setThumbnailHeight(data.thumbnailHeight)
      setGenerateThumbnailOnUpload(data.generateThumbnailOnUpload ?? true)

      // Store original values for dirty tracking
      setOriginalValues({
        maxFileSizeMB: fileSizeMB,
        maxThumbnailSizeMB: thumbnailSizeMB,
        thumbnailFrameCount: data.thumbnailFrameCount,
        thumbnailCameraAngle: data.thumbnailCameraVerticalAngle,
        thumbnailWidth: data.thumbnailWidth,
        thumbnailHeight: data.thumbnailHeight,
        generateThumbnailOnUpload: data.generateThumbnailOnUpload ?? true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    // Don't save if there are validation errors
    if (hasValidationErrors()) {
      setError('Please fix all validation errors before saving')
      return
    }

    // Don't save if there are no changes
    if (!hasChanges()) {
      setError('No changes to save')
      return
    }

    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    const updatedSettings = {
      maxFileSizeBytes: maxFileSizeMB * 1_048_576,
      maxThumbnailSizeBytes: maxThumbnailSizeMB * 1_048_576,
      thumbnailFrameCount,
      thumbnailCameraVerticalAngle: thumbnailCameraAngle,
      thumbnailWidth,
      thumbnailHeight,
      generateThumbnailOnUpload,
    }

    try {
      const data = await apiClient.updateSettings(updatedSettings)
      setSettings(data)

      // Update original values after successful save
      const fileSizeMB = Math.round(data.maxFileSizeBytes / 1_048_576)
      const thumbnailSizeMB = Math.round(data.maxThumbnailSizeBytes / 1_048_576)

      setOriginalValues({
        maxFileSizeMB: fileSizeMB,
        maxThumbnailSizeMB: thumbnailSizeMB,
        thumbnailFrameCount: data.thumbnailFrameCount,
        thumbnailCameraAngle: data.thumbnailCameraVerticalAngle,
        thumbnailWidth: data.thumbnailWidth,
        thumbnailHeight: data.thumbnailHeight,
        generateThumbnailOnUpload: data.generateThumbnailOnUpload ?? true,
      })

      setSuccessMessage('Settings saved successfully!')

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="settings-container">
        <div className="settings-loading">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="settings-container">
      <h2 className="settings-title">Application Settings</h2>

      {error && (
        <div className="settings-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {successMessage && (
        <div className="settings-success">{successMessage}</div>
      )}

      <form onSubmit={handleSave} className="settings-form">
        <div className="settings-form-content">
          <div className="settings-section">
            <div
              className="settings-section-header"
              onClick={() =>
                setActiveIndex(prev =>
                  Array.isArray(prev)
                    ? prev.includes(0)
                      ? prev.filter(i => i !== 0)
                      : [...prev, 0]
                    : [0]
                )
              }
            >
              <span>
                {Array.isArray(activeIndex) && activeIndex.includes(0)
                  ? '▼'
                  : '▶'}{' '}
                File Upload Settings
              </span>
            </div>
            {Array.isArray(activeIndex) && activeIndex.includes(0) && (
              <div className="settings-section-content">
                <div className="settings-field">
                  <label htmlFor="maxFileSize">
                    Maximum File Size (MB)
                    {isFieldDirty('maxFileSizeMB') && (
                      <span className="settings-dirty-indicator"> ★</span>
                    )}
                  </label>
                  <input
                    id="maxFileSize"
                    type="number"
                    min="1"
                    max="10240"
                    value={maxFileSizeMB}
                    onChange={e => {
                      const value = parseInt(e.target.value)
                      setMaxFileSizeMB(value)
                      const error = validateMaxFileSizeMB(value)
                      setValidationErrors(prev => {
                        const newErrors = { ...prev }
                        if (error) {
                          newErrors.maxFileSizeMB = error
                        } else {
                          delete newErrors.maxFileSizeMB
                        }
                        return newErrors
                      })
                    }}
                    disabled={isSaving}
                    className={
                      validationErrors.maxFileSizeMB
                        ? 'settings-input-error'
                        : ''
                    }
                  />
                  {validationErrors.maxFileSizeMB && (
                    <span className="settings-error-message">
                      {validationErrors.maxFileSizeMB}
                    </span>
                  )}
                  <span className="settings-help">
                    Maximum size for 3D model files (1-10240 MB)
                  </span>
                  <span className="settings-default">
                    Default: 1024 MB (1 GB)
                  </span>
                </div>

                <div className="settings-field">
                  <label htmlFor="maxThumbnailSize">
                    Maximum Thumbnail Size (MB)
                    {isFieldDirty('maxThumbnailSizeMB') && (
                      <span className="settings-dirty-indicator"> ★</span>
                    )}
                  </label>
                  <input
                    id="maxThumbnailSize"
                    type="number"
                    min="1"
                    max="100"
                    value={maxThumbnailSizeMB}
                    onChange={e => {
                      const value = parseInt(e.target.value)
                      setMaxThumbnailSizeMB(value)
                      const error = validateMaxThumbnailSizeMB(value)
                      setValidationErrors(prev => {
                        const newErrors = { ...prev }
                        if (error) {
                          newErrors.maxThumbnailSizeMB = error
                        } else {
                          delete newErrors.maxThumbnailSizeMB
                        }
                        return newErrors
                      })
                    }}
                    disabled={isSaving}
                    className={
                      validationErrors.maxThumbnailSizeMB
                        ? 'settings-input-error'
                        : ''
                    }
                  />
                  {validationErrors.maxThumbnailSizeMB && (
                    <span className="settings-error-message">
                      {validationErrors.maxThumbnailSizeMB}
                    </span>
                  )}
                  <span className="settings-help">
                    Maximum size for thumbnail images (1-100 MB)
                  </span>
                  <span className="settings-default">Default: 10 MB</span>
                </div>
              </div>
            )}
          </div>

          <div className="settings-section">
            <div
              className="settings-section-header"
              onClick={() =>
                setActiveIndex(prev =>
                  Array.isArray(prev)
                    ? prev.includes(1)
                      ? prev.filter(i => i !== 1)
                      : [...prev, 1]
                    : [1]
                )
              }
            >
              <span>
                {Array.isArray(activeIndex) && activeIndex.includes(1)
                  ? '▼'
                  : '▶'}{' '}
                Thumbnail Generation Settings
              </span>
            </div>
            {Array.isArray(activeIndex) && activeIndex.includes(1) && (
              <div className="settings-section-content">
                <div className="settings-field">
                  <label className="settings-checkbox-label">
                    <input
                      type="checkbox"
                      checked={generateThumbnailOnUpload}
                      onChange={e =>
                        setGenerateThumbnailOnUpload(e.target.checked)
                      }
                      disabled={isSaving}
                    />
                    <span>
                      Generate thumbnail on model upload
                      {isFieldDirty('generateThumbnailOnUpload') && (
                        <span className="settings-dirty-indicator"> ★</span>
                      )}
                    </span>
                  </label>
                  <span className="settings-help">
                    Automatically generate thumbnails when uploading new models
                  </span>
                  <span className="settings-default">Default: Yes</span>
                </div>

                <div className="settings-field">
                  <label htmlFor="frameCount">
                    Frame Count
                    {isFieldDirty('thumbnailFrameCount') && (
                      <span className="settings-dirty-indicator"> ★</span>
                    )}
                  </label>
                  <input
                    id="frameCount"
                    type="number"
                    min="1"
                    max="360"
                    value={thumbnailFrameCount}
                    onChange={e => {
                      const value = parseInt(e.target.value)
                      setThumbnailFrameCount(value)
                      const error = validateThumbnailFrameCount(value)
                      setValidationErrors(prev => {
                        const newErrors = { ...prev }
                        if (error) {
                          newErrors.thumbnailFrameCount = error
                        } else {
                          delete newErrors.thumbnailFrameCount
                        }
                        return newErrors
                      })
                    }}
                    disabled={isSaving}
                    className={
                      validationErrors.thumbnailFrameCount
                        ? 'settings-input-error'
                        : ''
                    }
                  />
                  {validationErrors.thumbnailFrameCount && (
                    <span className="settings-error-message">
                      {validationErrors.thumbnailFrameCount}
                    </span>
                  )}
                  <span className="settings-help">
                    Number of frames in thumbnail animation (1-360)
                  </span>
                  <span className="settings-default">Default: 30 frames</span>
                </div>

                <div className="settings-field">
                  <label htmlFor="cameraAngle">
                    Camera Vertical Angle
                    {isFieldDirty('thumbnailCameraAngle') && (
                      <span className="settings-dirty-indicator"> ★</span>
                    )}
                  </label>
                  <input
                    id="cameraAngle"
                    type="number"
                    min="0"
                    max="2"
                    step="0.01"
                    value={thumbnailCameraAngle}
                    onChange={e => {
                      const value = parseFloat(e.target.value)
                      setThumbnailCameraAngle(value)
                      const error = validateThumbnailCameraAngle(value)
                      setValidationErrors(prev => {
                        const newErrors = { ...prev }
                        if (error) {
                          newErrors.thumbnailCameraAngle = error
                        } else {
                          delete newErrors.thumbnailCameraAngle
                        }
                        return newErrors
                      })
                    }}
                    disabled={isSaving}
                    className={
                      validationErrors.thumbnailCameraAngle
                        ? 'settings-input-error'
                        : ''
                    }
                  />
                  {validationErrors.thumbnailCameraAngle && (
                    <span className="settings-error-message">
                      {validationErrors.thumbnailCameraAngle}
                    </span>
                  )}
                  <span className="settings-help">
                    Camera height multiplier (0-2)
                  </span>
                  <span className="settings-default">Default: 0.75</span>
                </div>

                <div className="settings-field">
                  <label htmlFor="thumbnailWidth">
                    Thumbnail Width (px)
                    {isFieldDirty('thumbnailWidth') && (
                      <span className="settings-dirty-indicator"> ★</span>
                    )}
                  </label>
                  <input
                    id="thumbnailWidth"
                    type="number"
                    min="64"
                    max="2048"
                    value={thumbnailWidth}
                    onChange={e => {
                      const value = parseInt(e.target.value)
                      setThumbnailWidth(value)
                      const error = validateThumbnailWidth(value)
                      setValidationErrors(prev => {
                        const newErrors = { ...prev }
                        if (error) {
                          newErrors.thumbnailWidth = error
                        } else {
                          delete newErrors.thumbnailWidth
                        }
                        return newErrors
                      })
                    }}
                    disabled={isSaving}
                    className={
                      validationErrors.thumbnailWidth
                        ? 'settings-input-error'
                        : ''
                    }
                  />
                  {validationErrors.thumbnailWidth && (
                    <span className="settings-error-message">
                      {validationErrors.thumbnailWidth}
                    </span>
                  )}
                  <span className="settings-help">
                    Width in pixels (64-2048)
                  </span>
                  <span className="settings-default">Default: 256 px</span>
                </div>

                <div className="settings-field">
                  <label htmlFor="thumbnailHeight">
                    Thumbnail Height (px)
                    {isFieldDirty('thumbnailHeight') && (
                      <span className="settings-dirty-indicator"> ★</span>
                    )}
                  </label>
                  <input
                    id="thumbnailHeight"
                    type="number"
                    min="64"
                    max="2048"
                    value={thumbnailHeight}
                    onChange={e => {
                      const value = parseInt(e.target.value)
                      setThumbnailHeight(value)
                      const error = validateThumbnailHeight(value)
                      setValidationErrors(prev => {
                        const newErrors = { ...prev }
                        if (error) {
                          newErrors.thumbnailHeight = error
                        } else {
                          delete newErrors.thumbnailHeight
                        }
                        return newErrors
                      })
                    }}
                    disabled={isSaving}
                    className={
                      validationErrors.thumbnailHeight
                        ? 'settings-input-error'
                        : ''
                    }
                  />
                  {validationErrors.thumbnailHeight && (
                    <span className="settings-error-message">
                      {validationErrors.thumbnailHeight}
                    </span>
                  )}
                  <span className="settings-help">
                    Height in pixels (64-2048)
                  </span>
                  <span className="settings-default">Default: 256 px</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-actions">
          <button
            type="submit"
            disabled={isSaving || !hasChanges() || hasValidationErrors()}
            className="settings-button settings-button-primary"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
          {hasChanges() && !hasValidationErrors() && (
            <span className="settings-unsaved-changes">★ Unsaved changes</span>
          )}
        </div>
      </form>
    </div>
  )
}

export default Settings
