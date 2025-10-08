import { useState, useEffect } from 'react'
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
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Accordion state
  const [activeIndex, setActiveIndex] = useState<number | number[]>([0, 1])

  // Form state
  const [maxFileSizeMB, setMaxFileSizeMB] = useState<number>(1024)
  const [maxThumbnailSizeMB, setMaxThumbnailSizeMB] = useState<number>(10)
  const [thumbnailFrameCount, setThumbnailFrameCount] = useState<number>(30)
  const [thumbnailCameraAngle, setThumbnailCameraAngle] = useState<number>(0.75)
  const [thumbnailWidth, setThumbnailWidth] = useState<number>(256)
  const [thumbnailHeight, setThumbnailHeight] = useState<number>(256)
  const [generateThumbnailOnUpload, setGenerateThumbnailOnUpload] = useState<boolean>(true)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiClient.getSettings()
      setSettings(data)
      
      // Update form state with fetched values
      setMaxFileSizeMB(Math.round(data.maxFileSizeBytes / 1_048_576))
      setMaxThumbnailSizeMB(Math.round(data.maxThumbnailSizeBytes / 1_048_576))
      setThumbnailFrameCount(data.thumbnailFrameCount)
      setThumbnailCameraAngle(data.thumbnailCameraVerticalAngle)
      setThumbnailWidth(data.thumbnailWidth)
      setThumbnailHeight(data.thumbnailHeight)
      setGenerateThumbnailOnUpload(data.generateThumbnailOnUpload ?? true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
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
        <div className="settings-success">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSave} className="settings-form">
        <div className="settings-section">
          <div 
            className="settings-section-header" 
            onClick={() => setActiveIndex(prev => Array.isArray(prev) ? (prev.includes(0) ? prev.filter(i => i !== 0) : [...prev, 0]) : [0])}
          >
            <span>{Array.isArray(activeIndex) && activeIndex.includes(0) ? '▼' : '▶'} File Upload Settings</span>
          </div>
          {Array.isArray(activeIndex) && activeIndex.includes(0) && (
            <div className="settings-section-content">
              <div className="settings-field">
                <label htmlFor="maxFileSize">Maximum File Size (MB)</label>
                <input
                  id="maxFileSize"
                  type="number"
                  min="1"
                  max="10240"
                  value={maxFileSizeMB}
                  onChange={(e) => setMaxFileSizeMB(parseInt(e.target.value))}
                  disabled={isSaving}
                />
                <span className="settings-help">Maximum size for 3D model files (1-10240 MB)</span>
              </div>

              <div className="settings-field">
                <label htmlFor="maxThumbnailSize">Maximum Thumbnail Size (MB)</label>
                <input
                  id="maxThumbnailSize"
                  type="number"
                  min="1"
                  max="100"
                  value={maxThumbnailSizeMB}
                  onChange={(e) => setMaxThumbnailSizeMB(parseInt(e.target.value))}
                  disabled={isSaving}
                />
                <span className="settings-help">Maximum size for thumbnail images (1-100 MB)</span>
              </div>
            </div>
          )}
        </div>

        <div className="settings-section">
          <div 
            className="settings-section-header"
            onClick={() => setActiveIndex(prev => Array.isArray(prev) ? (prev.includes(1) ? prev.filter(i => i !== 1) : [...prev, 1]) : [1])}
          >
            <span>{Array.isArray(activeIndex) && activeIndex.includes(1) ? '▼' : '▶'} Thumbnail Generation Settings</span>
          </div>
          {Array.isArray(activeIndex) && activeIndex.includes(1) && (
            <div className="settings-section-content">
              <div className="settings-field">
                <label className="settings-checkbox-label">
                  <input
                    type="checkbox"
                    checked={generateThumbnailOnUpload}
                    onChange={(e) => setGenerateThumbnailOnUpload(e.target.checked)}
                    disabled={isSaving}
                  />
                  <span>Generate thumbnail on model upload</span>
                </label>
                <span className="settings-help">Automatically generate thumbnails when uploading new models</span>
              </div>

              <div className="settings-field">
                <label htmlFor="frameCount">Frame Count</label>
                <input
                  id="frameCount"
                  type="number"
                  min="1"
                  max="360"
                  value={thumbnailFrameCount}
                  onChange={(e) => setThumbnailFrameCount(parseInt(e.target.value))}
                  disabled={isSaving}
                />
                <span className="settings-help">Number of frames in thumbnail animation (1-360)</span>
              </div>

              <div className="settings-field">
                <label htmlFor="cameraAngle">Camera Vertical Angle</label>
                <input
                  id="cameraAngle"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={thumbnailCameraAngle}
                  onChange={(e) => setThumbnailCameraAngle(parseFloat(e.target.value))}
                  disabled={isSaving}
                />
                <span className="settings-help">Camera height multiplier (0-2)</span>
              </div>

              <div className="settings-field">
                <label htmlFor="thumbnailWidth">Thumbnail Width (px)</label>
                <input
                  id="thumbnailWidth"
                  type="number"
                  min="64"
                  max="2048"
                  value={thumbnailWidth}
                  onChange={(e) => setThumbnailWidth(parseInt(e.target.value))}
                  disabled={isSaving}
                />
                <span className="settings-help">Width in pixels (64-2048)</span>
              </div>

              <div className="settings-field">
                <label htmlFor="thumbnailHeight">Thumbnail Height (px)</label>
                <input
                  id="thumbnailHeight"
                  type="number"
                  min="64"
                  max="2048"
                  value={thumbnailHeight}
                  onChange={(e) => setThumbnailHeight(parseInt(e.target.value))}
                  disabled={isSaving}
                />
                <span className="settings-help">Height in pixels (64-2048)</span>
              </div>
            </div>
          )}
        </div>

        <div className="settings-actions">
          <button
            type="button"
            onClick={fetchSettings}
            disabled={isSaving}
            className="settings-button settings-button-secondary"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="settings-button settings-button-primary"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Settings
