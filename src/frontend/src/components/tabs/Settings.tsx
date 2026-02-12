import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useTheme } from '@/hooks/useTheme'
import { useSettingsQuery } from '@/features/settings/api/queries'
import { updateSettings } from '@/features/settings/api/settingsApi'
import { settingsFormSchema } from '@/shared/validation/formSchemas'
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

type SettingsFormValues = z.input<typeof settingsFormSchema>
type SettingsFormOutput = z.output<typeof settingsFormSchema>

function Settings(): JSX.Element {
  const [_settings, setSettings] = useState<SettingsData | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const settingsQuery = useSettingsQuery()
  const isLoading = settingsQuery.isLoading

  // Theme hook
  const { theme, setTheme } = useTheme()

  // Accordion state
  const [activeIndex, setActiveIndex] = useState<number | number[]>([0, 1, 2])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isValid },
  } = useForm<SettingsFormValues, unknown, SettingsFormOutput>({
    resolver: zodResolver(settingsFormSchema),
    mode: 'onChange',
    defaultValues: {
      maxFileSizeMB: 1024,
      maxThumbnailSizeMB: 10,
      thumbnailFrameCount: 30,
      thumbnailCameraAngle: 0.75,
      thumbnailWidth: 256,
      thumbnailHeight: 256,
      generateThumbnailOnUpload: true,
    },
  })

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

  const maxFileSizeMB = watch('maxFileSizeMB')
  const maxThumbnailSizeMB = watch('maxThumbnailSizeMB')
  const thumbnailFrameCount = watch('thumbnailFrameCount')
  const thumbnailCameraAngle = watch('thumbnailCameraAngle')
  const thumbnailWidth = watch('thumbnailWidth')
  const thumbnailHeight = watch('thumbnailHeight')
  const generateThumbnailOnUpload = watch('generateThumbnailOnUpload')

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
    return !isValid
  }

  useEffect(() => {
    if (!settingsQuery.error) return
    setError(
      settingsQuery.error instanceof Error
        ? settingsQuery.error.message
        : 'An error occurred'
    )
  }, [settingsQuery.error])

  useEffect(() => {
    if (!settingsQuery.data) return

    const data = settingsQuery.data
    setError(null)
    setSettings(data)

    const fileSizeMB = Math.round(data.maxFileSizeBytes / 1_048_576)
    const thumbnailSizeMB = Math.round(data.maxThumbnailSizeBytes / 1_048_576)

    reset({
      maxFileSizeMB: fileSizeMB,
      maxThumbnailSizeMB: thumbnailSizeMB,
      thumbnailFrameCount: data.thumbnailFrameCount,
      thumbnailCameraAngle: data.thumbnailCameraVerticalAngle,
      thumbnailWidth: data.thumbnailWidth,
      thumbnailHeight: data.thumbnailHeight,
      generateThumbnailOnUpload: data.generateThumbnailOnUpload ?? true,
    })

    setOriginalValues({
      maxFileSizeMB: fileSizeMB,
      maxThumbnailSizeMB: thumbnailSizeMB,
      thumbnailFrameCount: data.thumbnailFrameCount,
      thumbnailCameraAngle: data.thumbnailCameraVerticalAngle,
      thumbnailWidth: data.thumbnailWidth,
      thumbnailHeight: data.thumbnailHeight,
      generateThumbnailOnUpload: data.generateThumbnailOnUpload ?? true,
    })
  }, [settingsQuery.data, reset])

  const handleSave = async (values: SettingsFormOutput) => {
    // Don't save if there are no changes
    if (!hasChanges()) {
      setError('No changes to save')
      return
    }

    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    const updatedSettings = {
      maxFileSizeBytes: values.maxFileSizeMB * 1_048_576,
      maxThumbnailSizeBytes: values.maxThumbnailSizeMB * 1_048_576,
      thumbnailFrameCount: values.thumbnailFrameCount,
      thumbnailCameraVerticalAngle: values.thumbnailCameraAngle,
      thumbnailWidth: values.thumbnailWidth,
      thumbnailHeight: values.thumbnailHeight,
      generateThumbnailOnUpload: values.generateThumbnailOnUpload,
    }

    try {
      const data = await updateSettings(updatedSettings)
      setSettings(data)
      await queryClient.invalidateQueries({ queryKey: ['settings'] })

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

      reset({
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

  const handleInvalidSave = () => {
    setError('Please fix all validation errors before saving')
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

      <form
        onSubmit={handleSubmit(handleSave, handleInvalidSave)}
        className="settings-form"
      >
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
                Appearance
              </span>
            </div>
            {Array.isArray(activeIndex) && activeIndex.includes(0) && (
              <div className="settings-section-content">
                <div className="settings-field">
                  <label htmlFor="colorTheme">Color Theme</label>
                  <select
                    id="colorTheme"
                    value={theme}
                    onChange={e => setTheme(e.target.value as 'light' | 'dark')}
                    className="settings-select"
                  >
                    <option value="light">Light Theme</option>
                    <option value="dark">Dark Theme</option>
                  </select>
                  <span className="settings-help">
                    Choose between light and dark color themes
                  </span>
                  <span className="settings-default">Default: Light Theme</span>
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
                File Upload Settings
              </span>
            </div>
            {Array.isArray(activeIndex) && activeIndex.includes(1) && (
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
                    {...register('maxFileSizeMB', { valueAsNumber: true })}
                    disabled={isSaving}
                    className={
                      errors.maxFileSizeMB ? 'settings-input-error' : ''
                    }
                  />
                  {errors.maxFileSizeMB && (
                    <span className="settings-error-message">
                      {errors.maxFileSizeMB.message}
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
                    {...register('maxThumbnailSizeMB', { valueAsNumber: true })}
                    disabled={isSaving}
                    className={
                      errors.maxThumbnailSizeMB ? 'settings-input-error' : ''
                    }
                  />
                  {errors.maxThumbnailSizeMB && (
                    <span className="settings-error-message">
                      {errors.maxThumbnailSizeMB.message}
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
                    ? prev.includes(2)
                      ? prev.filter(i => i !== 2)
                      : [...prev, 2]
                    : [2]
                )
              }
            >
              <span>
                {Array.isArray(activeIndex) && activeIndex.includes(2)
                  ? '▼'
                  : '▶'}{' '}
                Thumbnail Generation Settings
              </span>
            </div>
            {Array.isArray(activeIndex) && activeIndex.includes(2) && (
              <div className="settings-section-content">
                <div className="settings-field">
                  <label className="settings-checkbox-label">
                    <input
                      type="checkbox"
                      {...register('generateThumbnailOnUpload')}
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
                    {...register('thumbnailFrameCount', {
                      valueAsNumber: true,
                    })}
                    disabled={isSaving}
                    className={
                      errors.thumbnailFrameCount ? 'settings-input-error' : ''
                    }
                  />
                  {errors.thumbnailFrameCount && (
                    <span className="settings-error-message">
                      {errors.thumbnailFrameCount.message}
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
                    {...register('thumbnailCameraAngle', {
                      valueAsNumber: true,
                    })}
                    disabled={isSaving}
                    className={
                      errors.thumbnailCameraAngle ? 'settings-input-error' : ''
                    }
                  />
                  {errors.thumbnailCameraAngle && (
                    <span className="settings-error-message">
                      {errors.thumbnailCameraAngle.message}
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
                    {...register('thumbnailWidth', { valueAsNumber: true })}
                    disabled={isSaving}
                    className={
                      errors.thumbnailWidth ? 'settings-input-error' : ''
                    }
                  />
                  {errors.thumbnailWidth && (
                    <span className="settings-error-message">
                      {errors.thumbnailWidth.message}
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
                    {...register('thumbnailHeight', { valueAsNumber: true })}
                    disabled={isSaving}
                    className={
                      errors.thumbnailHeight ? 'settings-input-error' : ''
                    }
                  />
                  {errors.thumbnailHeight && (
                    <span className="settings-error-message">
                      {errors.thumbnailHeight.message}
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
