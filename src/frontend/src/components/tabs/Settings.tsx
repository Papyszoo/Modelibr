import './Settings.css'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { type z } from 'zod'

import { useSettingsQuery } from '@/features/settings/api/queries'
import type {
  BlenderInstallStatus,
  BlenderVersionInfo,
  WebDavUrlEntry,
} from '@/features/settings/api/settingsApi'
import {
  getBlenderStatus,
  getBlenderVersions,
  getWebDavUrls,
  installBlender,
  probeWebDavUrl,
  uninstallBlender,
  updateSettings,
} from '@/features/settings/api/settingsApi'
import { useTheme } from '@/hooks/useTheme'
import { settingsFormSchema } from '@/shared/validation/formSchemas'
import { useBlenderEnabledStore } from '@/stores/blenderEnabledStore'
import {
  type MobileBarPosition,
  useUIPreferencesStore,
} from '@/stores/uiPreferencesStore'

import { WebDavInstructions } from './WebDavInstructions'

interface SettingsData {
  maxFileSizeBytes: number
  maxThumbnailSizeBytes: number
  thumbnailFrameCount: number
  thumbnailCameraVerticalAngle: number
  thumbnailWidth: number
  thumbnailHeight: number
  generateThumbnailOnUpload: boolean
  textureProxySize: number
}

type SettingsFormValues = z.input<typeof settingsFormSchema>
type SettingsFormOutput = z.output<typeof settingsFormSchema>

export function Settings(): JSX.Element {
  const [_settings, setSettings] = useState<SettingsData | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const settingsQuery = useSettingsQuery()
  const isLoading = settingsQuery.isLoading
  const isDemo = import.meta.env.VITE_DEMO_MODE === 'true'

  // Theme hook
  const { theme, setTheme } = useTheme()
  const mobileBarPosition = useUIPreferencesStore(s => s.mobileBarPosition)
  const setMobileBarPosition = useUIPreferencesStore(
    s => s.setMobileBarPosition
  )

  // Blender version management state
  const [blenderVersions, setBlenderVersions] = useState<BlenderVersionInfo[]>(
    []
  )
  const fetchBlenderEnabled = useBlenderEnabledStore(s => s.fetchBlenderEnabled)
  const [blenderStatus, setBlenderStatus] = useState<BlenderInstallStatus>({
    state: 'none',
    installedVersion: null,
    installedPath: null,
    progress: 0,
    downloadedBytes: null,
    totalBytes: null,
    error: null,
  })
  const [selectedVersion, setSelectedVersion] = useState<string>('')
  const [infoExpanded, setInfoExpanded] = useState(false)
  const [blenderVersionsOffline, setBlenderVersionsOffline] = useState(false)

  // WebDAV state
  const [webDavUrls, setWebDavUrls] = useState<WebDavUrlEntry[]>([])
  const [probeResults, setProbeResults] = useState<
    Record<string, { reachable: boolean; folderCount: number; error?: string }>
  >({})
  const [probeLoading, setProbeLoading] = useState(false)
  const [webDavInstructionsExpanded, setWebDavInstructionsExpanded] =
    useState(false)

  // Accordion state — in demo mode sections 4 (Blender), 5 (SSL), 6 (WebDAV) stay collapsed
  const [activeIndex, setActiveIndex] = useState<number | number[]>(
    isDemo ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6]
  )

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
      textureProxySize: 512,
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
    textureProxySize: number
  } | null>(null)

  const maxFileSizeMB = watch('maxFileSizeMB')
  const maxThumbnailSizeMB = watch('maxThumbnailSizeMB')
  const thumbnailFrameCount = watch('thumbnailFrameCount')
  const thumbnailCameraAngle = watch('thumbnailCameraAngle')
  const thumbnailWidth = watch('thumbnailWidth')
  const thumbnailHeight = watch('thumbnailHeight')
  const generateThumbnailOnUpload = watch('generateThumbnailOnUpload')
  const textureProxySize = watch('textureProxySize')

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
      case 'textureProxySize':
        return textureProxySize !== originalValues.textureProxySize
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
      isFieldDirty('generateThumbnailOnUpload') ||
      isFieldDirty('textureProxySize')
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
      textureProxySize: data.textureProxySize ?? 512,
    })

    setOriginalValues({
      maxFileSizeMB: fileSizeMB,
      maxThumbnailSizeMB: thumbnailSizeMB,
      thumbnailFrameCount: data.thumbnailFrameCount,
      thumbnailCameraAngle: data.thumbnailCameraVerticalAngle,
      thumbnailWidth: data.thumbnailWidth,
      thumbnailHeight: data.thumbnailHeight,
      generateThumbnailOnUpload: data.generateThumbnailOnUpload ?? true,
      textureProxySize: data.textureProxySize ?? 512,
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
      textureProxySize: values.textureProxySize,
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
        textureProxySize: data.textureProxySize ?? 512,
      })

      reset({
        maxFileSizeMB: fileSizeMB,
        maxThumbnailSizeMB: thumbnailSizeMB,
        thumbnailFrameCount: data.thumbnailFrameCount,
        thumbnailCameraAngle: data.thumbnailCameraVerticalAngle,
        thumbnailWidth: data.thumbnailWidth,
        thumbnailHeight: data.thumbnailHeight,
        generateThumbnailOnUpload: data.generateThumbnailOnUpload ?? true,
        textureProxySize: data.textureProxySize ?? 512,
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

  // ── Blender version management effects ──────────────────────────────

  useEffect(() => {
    if (isDemo) return
    getBlenderVersions()
      .then(({ versions, isOffline }) => {
        setBlenderVersions(versions)
        setBlenderVersionsOffline(isOffline)
        if (versions.length > 0 && !selectedVersion) {
          setSelectedVersion(versions[0].version)
        }
      })
      .catch(() => {
        setBlenderVersionsOffline(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo])

  useEffect(() => {
    if (isDemo) return
    getBlenderStatus()
      .then(status => {
        setBlenderStatus(status)
        if (status.installedVersion) {
          setSelectedVersion(status.installedVersion)
        }
      })
      .catch(() => {})
  }, [isDemo])

  // Poll for progress during download/extract
  useEffect(() => {
    if (isDemo) return
    if (
      blenderStatus.state !== 'downloading' &&
      blenderStatus.state !== 'extracting'
    )
      return

    const interval = setInterval(() => {
      getBlenderStatus()
        .then(status => {
          setBlenderStatus(status)
          // Refresh blender enabled state when installation completes
          if (status.state === 'installed' && status.installedPath) {
            void fetchBlenderEnabled()
          }
        })
        .catch(() => {})
    }, 1000)

    return () => clearInterval(interval)
  }, [blenderStatus.state, isDemo, reset, fetchBlenderEnabled])

  const handleInstallBlender = async () => {
    if (!selectedVersion || isDemo) return
    try {
      const status = await installBlender(selectedVersion)
      setBlenderStatus(status)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to start installation'
      )
    }
  }

  // ── WebDAV URL discovery ──────────────────────────────────────────────

  const probeAllWebDavUrls = async (urls: WebDavUrlEntry[]) => {
    if (urls.length === 0) return
    setProbeLoading(true)
    setProbeResults({})
    try {
      const results = await Promise.all(
        urls.map(async entry => {
          // Append /modelibr — the probe endpoint forwards the path through
          // the internal nginx server to validate the full request chain.
          const probeUrl = entry.url.replace(/\/+$/, '') + '/modelibr'
          try {
            const result = await probeWebDavUrl(probeUrl)
            return [entry.url, result] as const
          } catch {
            return [
              entry.url,
              { reachable: false, folderCount: 0, error: 'Request failed' },
            ] as const
          }
        })
      )
      setProbeResults(Object.fromEntries(results))
    } finally {
      setProbeLoading(false)
    }
  }

  useEffect(() => {
    getWebDavUrls()
      .then(({ urls }) => {
        setWebDavUrls(urls)
        void probeAllWebDavUrls(urls)
      })
      .catch(() => {})
  }, [])

  const handleUninstallBlender = async () => {
    if (isDemo) return
    try {
      const status = await uninstallBlender()
      setBlenderStatus(status)
      void fetchBlenderEnabled()
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to uninstall')
    }
  }

  const formatBytes = (bytes: number | null): string => {
    if (bytes == null) return '...'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const isBlenderBusy =
    blenderStatus.state === 'downloading' ||
    blenderStatus.state === 'extracting'

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

                <div className="settings-field">
                  <label htmlFor="mobileBarPosition">
                    Mobile Tab Bar Position
                  </label>
                  <select
                    id="mobileBarPosition"
                    value={mobileBarPosition}
                    onChange={e =>
                      setMobileBarPosition(e.target.value as MobileBarPosition)
                    }
                    className="settings-select"
                  >
                    <option value="left">Left (vertical)</option>
                    <option value="bottom">Bottom (horizontal)</option>
                    <option value="top">Top (horizontal)</option>
                  </select>
                  <span className="settings-help">
                    Where the tab bar appears on narrow (mobile) screens. The
                    desktop layout is unaffected.
                  </span>
                  <span className="settings-default">Default: Left</span>
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

          <div className="settings-section">
            <div
              className="settings-section-header"
              onClick={() =>
                setActiveIndex(prev =>
                  Array.isArray(prev)
                    ? prev.includes(3)
                      ? prev.filter(i => i !== 3)
                      : [...prev, 3]
                    : [3]
                )
              }
            >
              <span>
                {Array.isArray(activeIndex) && activeIndex.includes(3)
                  ? '▼'
                  : '▶'}{' '}
                Texture Proxy Settings
              </span>
            </div>
            {Array.isArray(activeIndex) && activeIndex.includes(3) && (
              <div className="settings-section-content">
                <div className="settings-field">
                  <label htmlFor="textureProxySize">
                    Web Proxy Resolution
                    {isFieldDirty('textureProxySize') && (
                      <span className="settings-dirty-indicator"> ★</span>
                    )}
                  </label>
                  <select
                    id="textureProxySize"
                    {...register('textureProxySize', { valueAsNumber: true })}
                    disabled={isSaving}
                    className={
                      errors.textureProxySize
                        ? 'settings-input-error'
                        : 'settings-select'
                    }
                  >
                    <option value={256}>256 px</option>
                    <option value={512}>512 px</option>
                    <option value={1024}>1024 px</option>
                    <option value={2048}>2048 px</option>
                  </select>
                  {errors.textureProxySize && (
                    <span className="settings-error-message">
                      {errors.textureProxySize.message}
                    </span>
                  )}
                  <span className="settings-help">
                    Maximum square resolution for web preview textures. Lower
                    values load faster; higher values show more detail. Proxies
                    are generated on next texture set processing.
                  </span>
                  <span className="settings-default">Default: 512 px</span>
                </div>
              </div>
            )}
          </div>

          <div className="settings-section">
            <div
              className={`settings-section-header${isDemo ? ' settings-section-header--locked' : ''}`}
              onClick={() => {
                if (isDemo) return
                setActiveIndex(prev =>
                  Array.isArray(prev)
                    ? prev.includes(4)
                      ? prev.filter(i => i !== 4)
                      : [...prev, 4]
                    : [4]
                )
              }}
            >
              <span>
                {isDemo
                  ? '🔒'
                  : Array.isArray(activeIndex) && activeIndex.includes(4)
                    ? '▼'
                    : '▶'}{' '}
                Blender Settings
              </span>
              {isDemo && (
                <span className="settings-demo-notice">
                  Not available in demo mode
                </span>
              )}
            </div>
            {Array.isArray(activeIndex) && activeIndex.includes(4) && (
              <div className="settings-section-content">
                {/* Collapsible Info Box */}
                <div className="settings-field">
                  <div className="settings-info-box">
                    <button
                      type="button"
                      className="settings-info-toggle"
                      onClick={() => setInfoExpanded(prev => !prev)}
                      aria-expanded={infoExpanded}
                    >
                      <strong>
                        {infoExpanded ? '▼' : '▶'} What is Blender CLI?
                      </strong>
                    </button>
                    {infoExpanded && (
                      <div>
                        <p>
                          Blender is an open-source 3D creation suite. When
                          enabled, Modelibr uses Blender&apos;s command-line
                          interface to:
                        </p>
                        <ul>
                          <li>
                            Upload <code>.blend</code> files directly to Models
                            list or Model Version for model extraction
                            (configurable format)
                          </li>
                          <li>
                            Upload <code>.blend</code> files via WebDAV
                          </li>
                          <li>
                            Modify existing models with <code>.blend</code>{' '}
                            files
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Version Management */}
                <div className="settings-field">
                  <label>Blender Version</label>
                  <div className="blender-version-row">
                    <select
                      value={selectedVersion}
                      onChange={e => setSelectedVersion(e.target.value)}
                      disabled={
                        isDemo || isBlenderBusy || blenderVersionsOffline
                      }
                      className="settings-select"
                    >
                      {blenderVersions.map(v => (
                        <option key={v.version} value={v.version}>
                          {v.label}
                        </option>
                      ))}
                      {blenderVersionsOffline &&
                        blenderVersions.length === 0 && (
                          <option value="">No internet connection</option>
                        )}
                      {!blenderVersionsOffline &&
                        blenderVersions.length === 0 && (
                          <option value="">Loading versions...</option>
                        )}
                    </select>

                    {!blenderVersionsOffline &&
                      (blenderStatus.state === 'installed' &&
                      selectedVersion !== blenderStatus.installedVersion ? (
                        <button
                          type="button"
                          onClick={handleInstallBlender}
                          disabled={isDemo || !selectedVersion}
                          className="settings-button-small primary"
                        >
                          Switch Version
                        </button>
                      ) : blenderStatus.state !== 'installed' &&
                        !isBlenderBusy ? (
                        <button
                          type="button"
                          onClick={handleInstallBlender}
                          disabled={isDemo || !selectedVersion}
                          className="settings-button-small primary"
                        >
                          Install
                        </button>
                      ) : null)}

                    {blenderStatus.state === 'installed' && (
                      <button
                        type="button"
                        onClick={handleUninstallBlender}
                        disabled={isDemo}
                        className="settings-button-small danger"
                      >
                        Uninstall
                      </button>
                    )}
                  </div>

                  {/* Offline notice */}
                  {blenderVersionsOffline && (
                    <span className="blender-status-none">
                      No internet connection — version list unavailable.
                      {blenderStatus.state === 'installed'
                        ? ' Currently installed version can still be used.'
                        : ' Connect to the internet to download Blender.'}
                    </span>
                  )}

                  {/* Status */}
                  {blenderStatus.state === 'installed' && (
                    <span className="blender-status-installed">
                      ✓ Installed (v{blenderStatus.installedVersion})
                    </span>
                  )}

                  {blenderStatus.state === 'none' &&
                    !blenderVersionsOffline && (
                      <span className="blender-status-none">
                        Not installed — select a version and click Install
                      </span>
                    )}

                  {blenderStatus.state === 'failed' && (
                    <span className="blender-status-failed">
                      ✗ Installation failed: {blenderStatus.error}
                    </span>
                  )}

                  {/* Progress Bar */}
                  {isBlenderBusy && (
                    <div className="blender-progress-container">
                      <div className="blender-progress-bar">
                        <div
                          className="blender-progress-fill"
                          style={{ width: `${blenderStatus.progress}%` }}
                        />
                      </div>
                      <span className="blender-progress-text">
                        {blenderStatus.state === 'downloading'
                          ? `Downloading... ${blenderStatus.progress}% (${formatBytes(blenderStatus.downloadedBytes)} / ${formatBytes(blenderStatus.totalBytes)})`
                          : 'Extracting...'}
                      </span>
                    </div>
                  )}

                  <span className="settings-help">
                    Select a Blender version to download and install on the
                    server. Only one version can be installed at a time.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── SSL Certificate ───────────────────────────────────────── */}
          <div className="settings-section">
            <div
              className={`settings-section-header${isDemo ? ' settings-section-header--locked' : ''}`}
              onClick={() => {
                if (isDemo) return
                setActiveIndex(prev =>
                  Array.isArray(prev)
                    ? prev.includes(5)
                      ? prev.filter(i => i !== 5)
                      : [...prev, 5]
                    : [5]
                )
              }}
            >
              <span>
                {isDemo
                  ? '🔒'
                  : Array.isArray(activeIndex) && activeIndex.includes(5)
                    ? '▼'
                    : '▶'}{' '}
                SSL Certificate
              </span>
              {isDemo && (
                <span className="settings-demo-notice">
                  Not available in demo mode
                </span>
              )}
            </div>
            {Array.isArray(activeIndex) && activeIndex.includes(5) && (
              <div className="settings-section-content">
                <div className="settings-field">
                  {(() => {
                    const httpEntry = webDavUrls.find(e => !e.isHttps)
                    const httpsEntry = webDavUrls.find(e => e.isHttps)
                    const baseEntry = httpEntry ?? httpsEntry
                    const certUrl = baseEntry
                      ? new URL('/modelibr-cert.crt', baseEntry.url).href
                      : '/modelibr-cert.crt'
                    const hostname = baseEntry
                      ? new URL(baseEntry.url).hostname
                      : window.location.hostname

                    return (
                      <>
                        <div>
                          <a
                            href={certUrl}
                            download="modelibr-selfsigned.crt"
                            className="settings-button settings-button-secondary"
                            style={{ display: 'inline-block' }}
                          >
                            ↓ Download SSL Certificate
                          </a>
                        </div>
                        <span className="settings-help">
                          Install this certificate to trust Modelibr's
                          self-signed HTTPS certificate in your browser and OS.
                          Required for the browser to stop showing the security
                          warning, and for Windows WebDAV over HTTPS to work.
                          <br />
                          <strong>Windows:</strong> double-click →{' '}
                          <em>Install Certificate</em> → <em>Local Machine</em>{' '}
                          → <em>Trusted Root Certification Authorities</em>
                          <br />
                          <strong>macOS:</strong> double-click → open in{' '}
                          <em>Keychain Access</em> → set to{' '}
                          <em>Always Trust</em>
                          <br />
                          <strong>Firefox:</strong> Settings →{' '}
                          <em>Privacy &amp; Security</em> →{' '}
                          <em>Certificates</em> → <em>View Certificates…</em> →{' '}
                          <em>Authorities</em> → Import the downloaded file
                          {httpsEntry && (
                            <>
                              <br />
                              After trusting,{' '}
                              <code>\\{hostname}@SSL\modelibr</code> will work
                              in Windows Explorer.
                            </>
                          )}
                          {!baseEntry && (
                            <>
                              <br />
                              Configure <code>WEBDAV_HTTPS_PORT</code> or{' '}
                              <code>WEBDAV_HTTP_PORT</code> in <code>.env</code>{' '}
                              to get the correct download URL.
                            </>
                          )}
                        </span>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* ── WebDAV ───────────────────────────────────────────────── */}
          <div className="settings-section">
            <div
              className={`settings-section-header${isDemo ? ' settings-section-header--locked' : ''}`}
              onClick={() => {
                if (isDemo) return
                setActiveIndex(prev =>
                  Array.isArray(prev)
                    ? prev.includes(6)
                      ? prev.filter(i => i !== 6)
                      : [...prev, 6]
                    : [6]
                )
              }}
            >
              <span>
                {isDemo
                  ? '🔒'
                  : Array.isArray(activeIndex) && activeIndex.includes(6)
                    ? '▼'
                    : '▶'}{' '}
                WebDAV
              </span>
              {isDemo && (
                <span className="settings-demo-notice">
                  Not available in demo mode
                </span>
              )}
            </div>
            {Array.isArray(activeIndex) && activeIndex.includes(6) && (
              <div className="settings-section-content">
                {/* WebDAV connectivity status */}
                <div className="settings-field">
                  <label>WebDAV Connectivity</label>
                  {probeLoading ? (
                    <span className="blender-status-none">
                      Checking connectivity…
                    </span>
                  ) : webDavUrls.length === 0 ? (
                    <span className="blender-status-none settings-help">
                      No WebDAV ports configured. Set{' '}
                      <code>WEBDAV_HTTP_PORT</code> or{' '}
                      <code>WEBDAV_HTTPS_PORT</code> in <code>.env</code> and
                      restart.
                    </span>
                  ) : (
                    <div className="webdav-url-picker">
                      {webDavUrls.map(entry => {
                        const result = probeResults[entry.url]
                        const isPreferred =
                          !entry.isHttps || webDavUrls.every(e => e.isHttps)
                        return (
                          <div key={entry.url} className="webdav-url-row-label">
                            <span className="webdav-url-row-text">
                              <span className="webdav-url-row-label-text">
                                <code>
                                  {entry.url.replace(/\/$/, '')}/modelibr
                                </code>
                                <span className="webdav-url-row-tag">
                                  {entry.label}
                                </span>
                                {isPreferred && (
                                  <span
                                    className="webdav-url-row-tag"
                                    style={{
                                      background:
                                        'var(--color-accent, #0078d4)',
                                      color: '#fff',
                                    }}
                                  >
                                    preferred
                                  </span>
                                )}
                              </span>
                              {result ? (
                                result.reachable ? (
                                  <span className="blender-status-installed webdav-status-badge">
                                    ✓ Reachable ({result.folderCount} folder
                                    {result.folderCount !== 1 ? 's' : ''})
                                  </span>
                                ) : (
                                  <span className="blender-status-failed webdav-status-badge">
                                    ✗ {result.error ?? 'Not reachable'}
                                  </span>
                                )
                              ) : (
                                <span className="blender-status-none webdav-status-badge">
                                  …
                                </span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <span className="settings-help">
                    HTTP is preferred for local-network use. To change ports or
                    disable a protocol, edit <code>WEBDAV_HTTP_PORT</code> /{' '}
                    <code>WEBDAV_HTTPS_PORT</code> in <code>.env</code> and
                    restart Docker.
                  </span>
                </div>

                {/* Map as Network Drive Instructions */}
                <div className="settings-field">
                  <div className="settings-info-box">
                    <button
                      type="button"
                      className="settings-info-toggle"
                      onClick={() =>
                        setWebDavInstructionsExpanded(prev => !prev)
                      }
                      aria-expanded={webDavInstructionsExpanded}
                    >
                      <strong>
                        {webDavInstructionsExpanded ? '▼' : '▶'} How to map as
                        network drive
                      </strong>
                    </button>
                    {webDavInstructionsExpanded && <WebDavInstructions />}
                  </div>
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
