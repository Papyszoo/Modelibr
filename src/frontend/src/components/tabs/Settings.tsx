import { useState, useEffect } from 'react'
import './Settings.css'

interface SettingsData {
  maxFileSizeBytes: number
  maxThumbnailSizeBytes: number
  thumbnailFrameCount: number
  thumbnailCameraVerticalAngle: number
  thumbnailWidth: number
  thumbnailHeight: number
}

function Settings(): JSX.Element {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Form state
  const [maxFileSizeMB, setMaxFileSizeMB] = useState<number>(1024)
  const [maxThumbnailSizeMB, setMaxThumbnailSizeMB] = useState<number>(10)
  const [thumbnailFrameCount, setThumbnailFrameCount] = useState<number>(30)
  const [thumbnailCameraAngle, setThumbnailCameraAngle] = useState<number>(0.75)
  const [thumbnailWidth, setThumbnailWidth] = useState<number>(256)
  const [thumbnailHeight, setThumbnailHeight] = useState<number>(256)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('http://localhost:5009/settings')
      if (!response.ok) {
        throw new Error('Failed to load settings')
      }
      const data = await response.json()
      setSettings(data)
      
      // Update form state with fetched values
      setMaxFileSizeMB(Math.round(data.maxFileSizeBytes / 1_048_576))
      setMaxThumbnailSizeMB(Math.round(data.maxThumbnailSizeBytes / 1_048_576))
      setThumbnailFrameCount(data.thumbnailFrameCount)
      setThumbnailCameraAngle(data.thumbnailCameraVerticalAngle)
      setThumbnailWidth(data.thumbnailWidth)
      setThumbnailHeight(data.thumbnailHeight)
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
    }

    try {
      const response = await fetch('http://localhost:5009/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSettings),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to save settings')
      }

      const data = await response.json()
      setSettings({
        ...data,
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
        <div className="settings-success">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSave} className="settings-form">
        <section className="settings-section">
          <h3>File Upload Settings</h3>
          
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
        </section>

        <section className="settings-section">
          <h3>Thumbnail Generation Settings</h3>
          
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
        </section>

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
