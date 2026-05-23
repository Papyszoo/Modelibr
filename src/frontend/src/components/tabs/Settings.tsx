import './Settings.css'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { confirmDialog } from 'primereact/confirmdialog'
import {
  type JSX,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useForm } from 'react-hook-form'
import { type z } from 'zod'

import { useModelsQuery } from '@/features/models/api/queries'
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
  regenerateAllThumbnails,
  uninstallBlender,
  updateSetting,
  updateSettings,
} from '@/features/settings/api/settingsApi'
import { BackupsSection } from '@/features/settings/BackupsSection'
import { useTabUiState } from '@/hooks/useTabUiState'
import { useTheme } from '@/hooks/useTheme'
import { settingsFormSchema } from '@/shared/validation/formSchemas'
import { useBlenderEnabledStore } from '@/stores/blenderEnabledStore'
import {
  type MobileBarPosition,
  useUIPreferencesStore,
} from '@/stores/uiPreferencesStore'

import { WebDavInstructions } from './WebDavInstructions'

type SettingsFormValues = z.input<typeof settingsFormSchema>
type SettingsFormOutput = z.output<typeof settingsFormSchema>

type SectionKey =
  | 'appearance'
  | 'fileUpload'
  | 'thumbnails'
  | 'textureProxy'
  | 'blender'
  | 'ssl'
  | 'webdav'
  | 'backup'

interface SectionMeta {
  key: SectionKey
  label: string
  icon: string
  desc: string
  /** Field labels searched by the live filter — empty for action-only sections. */
  fields: string[]
  /** True when the section persists via the shared Save footer. */
  hasFormSave: boolean
  /** True when the section is disabled in demo mode. */
  demoLocked: boolean
}

const SECTIONS: SectionMeta[] = [
  {
    key: 'appearance',
    label: 'Appearance',
    icon: 'pi-palette',
    desc: 'Theme and interface display options',
    fields: ['Color theme', 'Mobile tab bar position'],
    hasFormSave: false,
    demoLocked: false,
  },
  {
    key: 'fileUpload',
    label: 'File Upload',
    icon: 'pi-upload',
    desc: 'Size limits and duplicate-name policy',
    fields: [
      'Maximum file size',
      'Maximum thumbnail size',
      'Duplicate name policy',
    ],
    hasFormSave: true,
    demoLocked: false,
  },
  {
    key: 'thumbnails',
    label: 'Thumbnail Generation',
    icon: 'pi-image',
    desc: 'Animated previews, resolution, frame count',
    fields: [
      'Generate thumbnail on upload',
      'Animated thumbnail',
      'Frame count',
      'Thumbnail size',
      'Regenerate all thumbnails',
    ],
    hasFormSave: true,
    demoLocked: false,
  },
  {
    key: 'textureProxy',
    label: 'Texture Proxy',
    icon: 'pi-clone',
    desc: 'Web preview texture resolution',
    fields: ['Web proxy resolution'],
    hasFormSave: true,
    demoLocked: false,
  },
  {
    key: 'blender',
    label: 'Blender',
    icon: 'pi-box',
    desc: 'Version management for .blend file support',
    fields: ['Blender version', 'Install', 'Uninstall'],
    hasFormSave: false,
    demoLocked: true,
  },
  {
    key: 'ssl',
    label: 'SSL Certificate',
    icon: 'pi-shield',
    desc: 'Download the self-signed HTTPS certificate',
    fields: ['Download SSL certificate'],
    hasFormSave: false,
    demoLocked: true,
  },
  {
    key: 'webdav',
    label: 'WebDAV',
    icon: 'pi-server',
    desc: 'Remote access endpoints and connectivity',
    fields: ['WebDAV URLs', 'Map as network drive'],
    hasFormSave: false,
    demoLocked: true,
  },
  {
    key: 'backup',
    label: 'Backup & Restore',
    icon: 'pi-history',
    desc: 'Database and uploads snapshots',
    fields: ['Create backup', 'Download backup', 'Restore backup'],
    hasFormSave: false,
    demoLocked: true,
  },
]

interface SearchResult {
  sectionKey: SectionKey
  sectionLabel: string
  label: string
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

interface SettingsProps {
  /** Owning tab id — used to persist activeSection across tab switches. */
  tabId?: string
}

export function Settings({ tabId }: SettingsProps = {}): JSX.Element {
  const queryClient = useQueryClient()
  const settingsQuery = useSettingsQuery()
  const isLoading = settingsQuery.isLoading
  const isDemo = import.meta.env.VITE_DEMO_MODE === 'true'

  // ── Top-level UI state ──────────────────────────────────────────────
  // activeSection lives in the per-tab UI state store so it survives the
  // unmount-on-tab-switch the TabContent rendering performs.
  const [activeSection, setActiveSection] = useTabUiState<SectionKey | null>(
    tabId ?? 'settings',
    'activeSection',
    null
  )
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchWrapRef = useRef<HTMLDivElement | null>(null)

  // ── Banner state ────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // ── Appearance (live-applied via stores) ────────────────────────────
  const { theme, setTheme } = useTheme()
  const mobileBarPosition = useUIPreferencesStore(s => s.mobileBarPosition)
  const setMobileBarPosition = useUIPreferencesStore(
    s => s.setMobileBarPosition
  )

  // ── Settings form (file upload + thumbnails + texture proxy) ────────
  const [isSaving, setIsSaving] = useState(false)
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
      thumbnailSize: 256,
      generateThumbnailOnUpload: true,
      generateAnimatedThumbnail: true,
      textureProxySize: 512,
    },
  })

  type OriginalValues = {
    maxFileSizeMB: number
    maxThumbnailSizeMB: number
    thumbnailFrameCount: number
    thumbnailSize: number
    generateThumbnailOnUpload: boolean
    generateAnimatedThumbnail: boolean
    textureProxySize: number
  }
  const [originalValues, setOriginalValues] = useState<OriginalValues | null>(
    null
  )

  const maxFileSizeMB = watch('maxFileSizeMB')
  const maxThumbnailSizeMB = watch('maxThumbnailSizeMB')
  const thumbnailFrameCount = watch('thumbnailFrameCount')
  const thumbnailSize = watch('thumbnailSize')
  const generateThumbnailOnUpload = watch('generateThumbnailOnUpload')
  const generateAnimatedThumbnail = watch('generateAnimatedThumbnail')
  const textureProxySize = watch('textureProxySize')

  const isFieldDirty = (fieldName: keyof OriginalValues): boolean => {
    if (!originalValues) return false
    switch (fieldName) {
      case 'maxFileSizeMB':
        return maxFileSizeMB !== originalValues.maxFileSizeMB
      case 'maxThumbnailSizeMB':
        return maxThumbnailSizeMB !== originalValues.maxThumbnailSizeMB
      case 'thumbnailFrameCount':
        return thumbnailFrameCount !== originalValues.thumbnailFrameCount
      case 'thumbnailSize':
        return thumbnailSize !== originalValues.thumbnailSize
      case 'generateThumbnailOnUpload':
        return (
          generateThumbnailOnUpload !== originalValues.generateThumbnailOnUpload
        )
      case 'generateAnimatedThumbnail':
        return (
          generateAnimatedThumbnail !== originalValues.generateAnimatedThumbnail
        )
      case 'textureProxySize':
        return textureProxySize !== originalValues.textureProxySize
    }
  }

  const dirtyFieldsForSection = (key: SectionKey): (keyof OriginalValues)[] => {
    if (key === 'fileUpload') {
      return (['maxFileSizeMB', 'maxThumbnailSizeMB'] as const).filter(
        isFieldDirty
      )
    }
    if (key === 'thumbnails') {
      return (
        [
          'thumbnailFrameCount',
          'thumbnailSize',
          'generateThumbnailOnUpload',
          'generateAnimatedThumbnail',
        ] as const
      ).filter(isFieldDirty)
    }
    if (key === 'textureProxy') {
      return (['textureProxySize'] as const).filter(isFieldDirty)
    }
    return []
  }

  const hasChanges = (): boolean =>
    isFieldDirty('maxFileSizeMB') ||
    isFieldDirty('maxThumbnailSizeMB') ||
    isFieldDirty('thumbnailFrameCount') ||
    isFieldDirty('thumbnailSize') ||
    isFieldDirty('generateThumbnailOnUpload') ||
    isFieldDirty('generateAnimatedThumbnail') ||
    isFieldDirty('textureProxySize')

  const hasValidationErrors = (): boolean => !isValid

  // ── Models duplicate-name policy ────────────────────────────────────
  const [duplicateNamePolicy, setDuplicateNamePolicy] = useState('Reject')
  const [duplicateNamePolicySaving, setDuplicateNamePolicySaving] =
    useState(false)

  // ── Bulk thumbnail regenerate ───────────────────────────────────────
  const [isRegeneratingThumbnails, setIsRegeneratingThumbnails] =
    useState(false)
  const regenerateCountQuery = useModelsQuery({
    params: { page: 1, pageSize: 1 },
  })
  const regenerateAssetCount = regenerateCountQuery.data?.totalCount
  const regenerateAssetCountLabel =
    typeof regenerateAssetCount === 'number'
      ? `${regenerateAssetCount} ${regenerateAssetCount === 1 ? 'asset' : 'assets'}`
      : 'All existing assets'

  // ── Blender state ───────────────────────────────────────────────────
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
  const [selectedVersion, setSelectedVersion] = useState('')
  const [blenderVersionsOffline, setBlenderVersionsOffline] = useState(false)

  // ── WebDAV state ────────────────────────────────────────────────────
  const [webDavUrls, setWebDavUrls] = useState<WebDavUrlEntry[]>([])
  const [probeResults, setProbeResults] = useState<
    Record<string, { reachable: boolean; folderCount: number; error?: string }>
  >({})
  const [probeLoading, setProbeLoading] = useState(false)

  // ── Effects ─────────────────────────────────────────────────────────
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

    const fileSizeMB = Math.round(data.maxFileSizeBytes / 1_048_576)
    const thumbnailSizeMB = Math.round(data.maxThumbnailSizeBytes / 1_048_576)

    const original: OriginalValues = {
      maxFileSizeMB: fileSizeMB,
      maxThumbnailSizeMB: thumbnailSizeMB,
      thumbnailFrameCount: data.thumbnailFrameCount,
      thumbnailSize: data.thumbnailSize,
      generateThumbnailOnUpload: data.generateThumbnailOnUpload ?? true,
      generateAnimatedThumbnail: data.generateAnimatedThumbnail ?? true,
      textureProxySize: data.textureProxySize ?? 512,
    }
    reset(original)
    setOriginalValues(original)
    setDuplicateNamePolicy(data.duplicateNamePolicy ?? 'Reject')
  }, [settingsQuery.data, reset])

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
      .catch(() => setBlenderVersionsOffline(true))
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
          if (status.state === 'installed' && status.installedPath) {
            void fetchBlenderEnabled()
          }
        })
        .catch(() => {})
    }, 1000)
    return () => clearInterval(interval)
  }, [blenderStatus.state, isDemo, fetchBlenderEnabled])

  useEffect(() => {
    getWebDavUrls()
      .then(({ urls }) => {
        setWebDavUrls(urls)
        void probeAllWebDavUrls(urls)
      })
      .catch(() => {})
  }, [])

  // ── Close search dropdown when clicking outside ─────────────────────
  useEffect(() => {
    if (!searchOpen) return
    const handler = (e: MouseEvent) => {
      if (!searchWrapRef.current) return
      if (!searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [searchOpen])

  // ── Actions ─────────────────────────────────────────────────────────
  const handleSave = async (values: SettingsFormOutput) => {
    if (!hasChanges()) {
      setError('No changes to save')
      return
    }
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const data = await updateSettings({
        maxFileSizeBytes: values.maxFileSizeMB * 1_048_576,
        maxThumbnailSizeBytes: values.maxThumbnailSizeMB * 1_048_576,
        thumbnailFrameCount: values.thumbnailFrameCount,
        thumbnailSize: values.thumbnailSize,
        generateThumbnailOnUpload: values.generateThumbnailOnUpload,
        generateAnimatedThumbnail: values.generateAnimatedThumbnail,
        textureProxySize: values.textureProxySize,
      })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })

      const fileSizeMB = Math.round(data.maxFileSizeBytes / 1_048_576)
      const thumbnailSizeMB = Math.round(data.maxThumbnailSizeBytes / 1_048_576)
      const original: OriginalValues = {
        maxFileSizeMB: fileSizeMB,
        maxThumbnailSizeMB: thumbnailSizeMB,
        thumbnailFrameCount: data.thumbnailFrameCount,
        thumbnailSize: data.thumbnailSize,
        generateThumbnailOnUpload: data.generateThumbnailOnUpload ?? true,
        generateAnimatedThumbnail: data.generateAnimatedThumbnail ?? true,
        textureProxySize: data.textureProxySize ?? 512,
      }
      setOriginalValues(original)
      reset(original)
      setSuccessMessage('Settings saved successfully!')
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

  const handleDiscard = () => {
    if (originalValues) reset(originalValues)
    setError(null)
  }

  const handleBack = () => {
    if (
      activeSection &&
      dirtyFieldsForSection(activeSection).length > 0 &&
      !hasValidationErrors()
    ) {
      confirmDialog({
        message:
          'You have unsaved changes in this section. Leave without saving?',
        header: 'Discard changes',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Discard',
        rejectLabel: 'Stay',
        accept: () => {
          handleDiscard()
          setActiveSection(null)
        },
      })
      return
    }
    handleDiscard()
    setActiveSection(null)
  }

  const handleRegenerateAllThumbnails = (): void => {
    const countLabel =
      typeof regenerateAssetCount === 'number'
        ? `${regenerateAssetCount} ${regenerateAssetCount === 1 ? 'asset' : 'assets'}`
        : 'every existing asset'
    confirmDialog({
      message: `Regenerate thumbnails for ${countLabel}? Existing thumbnails will be replaced and may be temporarily unavailable while jobs are queued.`,
      header: 'Regenerate All Thumbnails',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Regenerate',
      rejectLabel: 'Cancel',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        setIsRegeneratingThumbnails(true)
        setError(null)
        setSuccessMessage(null)
        try {
          const { enqueuedCount, skippedCount } =
            await regenerateAllThumbnails()
          const skipNote =
            skippedCount > 0 ? ` (${skippedCount} skipped — no files)` : ''
          setSuccessMessage(
            `Queued ${enqueuedCount} thumbnail regeneration${enqueuedCount === 1 ? '' : 's'}${skipNote}.`
          )
          setTimeout(() => setSuccessMessage(null), 5000)
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to regenerate thumbnails'
          )
        } finally {
          setIsRegeneratingThumbnails(false)
        }
      },
    })
  }

  const handleDuplicateNamePolicyChange = async (
    newPolicy: string
  ): Promise<void> => {
    if (isDemo) return
    setDuplicateNamePolicySaving(true)
    try {
      await updateSetting('DuplicateNamePolicy', newPolicy)
      setDuplicateNamePolicy(newPolicy)
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update duplicate name policy'
      )
    } finally {
      setDuplicateNamePolicySaving(false)
    }
  }

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

  const probeAllWebDavUrls = async (urls: WebDavUrlEntry[]) => {
    if (urls.length === 0) return
    setProbeLoading(true)
    setProbeResults({})
    try {
      const results = await Promise.all(
        urls.map(async entry => {
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

  const formatBytes = (bytes: number | null): string => {
    if (bytes == null) return '...'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const isBlenderBusy =
    blenderStatus.state === 'downloading' ||
    blenderStatus.state === 'extracting'

  // ── Search index ────────────────────────────────────────────────────
  const searchIndex = useMemo<SearchResult[]>(
    () =>
      SECTIONS.flatMap(section => [
        {
          sectionKey: section.key,
          sectionLabel: section.label,
          label: section.label,
        },
        {
          sectionKey: section.key,
          sectionLabel: section.label,
          label: section.desc,
        },
        ...section.fields.map(f => ({
          sectionKey: section.key,
          sectionLabel: section.label,
          label: f,
        })),
      ]),
    []
  )

  const searchResults = useMemo<SearchResult[]>(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return searchIndex
      .filter(r => r.label.toLowerCase().includes(q))
      .slice(0, 12)
  }, [search, searchIndex])

  const matchingSectionKeys = useMemo<Set<SectionKey>>(() => {
    if (!search.trim()) return new Set(SECTIONS.map(s => s.key))
    return new Set(searchResults.map(r => r.sectionKey))
  }, [search, searchResults])

  const handleSelectSection = (key: SectionKey) => {
    setActiveSection(key)
    setSearch('')
    setSearchOpen(false)
  }

  if (isLoading) {
    return (
      <div className="settings-container">
        <div className="settings-loading">Loading settings...</div>
      </div>
    )
  }

  const currentSection = activeSection
    ? SECTIONS.find(s => s.key === activeSection)
    : null

  // ────────────────────────────────────────────────────────────────────
  // Detail view
  // ────────────────────────────────────────────────────────────────────
  if (currentSection) {
    const sectionDirty = dirtyFieldsForSection(currentSection.key).length > 0

    return (
      <div className="settings-container">
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
          className="settings-form section-detail"
        >
          <div className="section-detail-header">
            <button type="button" className="btn-back" onClick={handleBack}>
              <i className="pi pi-arrow-left" />
              <span>Settings</span>
            </button>
            <h2 className="section-detail-title">
              <i className={`pi ${currentSection.icon}`} />
              {currentSection.label}
            </h2>
            <p className="section-detail-desc">{currentSection.desc}</p>
          </div>

          <div className="section-detail-body settings-section-content">
            {currentSection.key === 'appearance' && (
              <div className="section-fields">
                <div className="settings-field">
                  <label htmlFor="colorTheme">Color theme</label>
                  <div className="theme-picker">
                    <button
                      type="button"
                      className={`theme-card ${theme === 'light' ? 'selected' : ''}`}
                      onClick={() => setTheme('light')}
                    >
                      <div className="theme-card-swatch theme-card-swatch--light" />
                      <div className="theme-card-label">Light</div>
                    </button>
                    <button
                      type="button"
                      className={`theme-card ${theme === 'dark' ? 'selected' : ''}`}
                      onClick={() => setTheme('dark')}
                    >
                      <div className="theme-card-swatch theme-card-swatch--dark" />
                      <div className="theme-card-label">Dark</div>
                    </button>
                  </div>
                  {/* Hidden select kept for e2e tests targeting #colorTheme */}
                  <select
                    id="colorTheme"
                    value={theme}
                    onChange={e => setTheme(e.target.value as 'light' | 'dark')}
                    className="settings-select theme-select-hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    <option value="light">Light Theme</option>
                    <option value="dark">Dark Theme</option>
                  </select>
                  <span className="settings-help">
                    Switches the PrimeReact theme across the whole app.
                  </span>
                </div>

                <div className="settings-field">
                  <label htmlFor="mobileBarPosition">
                    Mobile tab bar position
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
                </div>
              </div>
            )}

            {currentSection.key === 'fileUpload' && (
              <div className="section-fields">
                <div className="settings-field">
                  <label htmlFor="maxFileSize">
                    Maximum file size (MB)
                    {isFieldDirty('maxFileSizeMB') && (
                      <span className="settings-dirty-indicator">
                        <span className="unsaved-dot" />
                      </span>
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
                    Per-file limit for 3D model uploads (1–10240 MB).
                  </span>
                  <span className="settings-default">Default: 1024 MB</span>
                </div>

                <div className="settings-field">
                  <label htmlFor="maxThumbnailSize">
                    Maximum thumbnail size (MB)
                    {isFieldDirty('maxThumbnailSizeMB') && (
                      <span className="settings-dirty-indicator">
                        <span className="unsaved-dot" />
                      </span>
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
                    Per-file limit for thumbnail uploads (1–100 MB).
                  </span>
                  <span className="settings-default">Default: 10 MB</span>
                </div>

                <div className="settings-field">
                  <label htmlFor="duplicateNamePolicy">
                    Duplicate name policy
                  </label>
                  <select
                    id="duplicateNamePolicy"
                    value={duplicateNamePolicy}
                    onChange={e =>
                      void handleDuplicateNamePolicyChange(e.target.value)
                    }
                    disabled={duplicateNamePolicySaving || isDemo}
                    className="settings-select"
                  >
                    <option value="Reject">Reject duplicate names</option>
                    <option value="AutoRename">
                      Auto-rename duplicates (e.g. Chair → Chair (2))
                    </option>
                  </select>
                  <span className="settings-help">
                    Controls what happens when uploading an asset with a name
                    that already exists. Applies to all asset types.{' '}
                    <strong>Reject</strong> blocks the upload.{' '}
                    <strong>Auto-rename</strong> appends a numeric suffix.
                  </span>
                  <span className="settings-default">
                    Default: Reject duplicate names
                  </span>
                </div>
              </div>
            )}

            {currentSection.key === 'thumbnails' && (
              <div className="section-fields">
                <ToggleField
                  label="Generate thumbnail on upload"
                  help="Automatically generate thumbnails when uploading new models."
                  isOn={generateThumbnailOnUpload}
                  dirty={isFieldDirty('generateThumbnailOnUpload')}
                  registerProps={register('generateThumbnailOnUpload')}
                />

                <ToggleField
                  id="generateAnimatedThumbnail"
                  label="Animated thumbnail"
                  help="Render a multi-frame orbiting animation. Disable to produce a single static frame."
                  isOn={generateAnimatedThumbnail}
                  dirty={isFieldDirty('generateAnimatedThumbnail')}
                  registerProps={register('generateAnimatedThumbnail')}
                />

                {generateAnimatedThumbnail && (
                  <div className="settings-field">
                    <label htmlFor="frameCount">
                      Frame count
                      {isFieldDirty('thumbnailFrameCount') && (
                        <span className="settings-dirty-indicator">
                          <span className="unsaved-dot" />
                        </span>
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
                      Number of frames in the turntable animation (1–360).
                      Higher values look smoother but take longer to render.
                    </span>
                    <span className="settings-default">Default: 30 frames</span>
                  </div>
                )}

                <div className="settings-field">
                  <label htmlFor="thumbnailSize">
                    Thumbnail size (px)
                    {isFieldDirty('thumbnailSize') && (
                      <span className="settings-dirty-indicator">
                        <span className="unsaved-dot" />
                      </span>
                    )}
                  </label>
                  <select
                    id="thumbnailSize"
                    {...register('thumbnailSize', { valueAsNumber: true })}
                    disabled={isSaving}
                    className={
                      errors.thumbnailSize
                        ? 'settings-input-error'
                        : 'settings-select'
                    }
                  >
                    <option value={64}>64 px</option>
                    <option value={128}>128 px</option>
                    <option value={256}>256 px</option>
                    <option value={512}>512 px</option>
                    <option value={1024}>1024 px</option>
                    <option value={2048}>2048 px</option>
                  </select>
                  {errors.thumbnailSize && (
                    <span className="settings-error-message">
                      {errors.thumbnailSize.message}
                    </span>
                  )}
                  <span className="settings-help">
                    Square side length for rendered thumbnails.
                  </span>
                  <span className="settings-default">Default: 256 px</span>
                </div>

                <div className="settings-field">
                  <label>Regenerate existing thumbnails</label>
                  <button
                    type="button"
                    onClick={() => void handleRegenerateAllThumbnails()}
                    disabled={isRegeneratingThumbnails || isDemo}
                    className="btn btn-outline"
                  >
                    <i className="pi pi-refresh" />
                    {isRegeneratingThumbnails
                      ? 'Queueing…'
                      : 'Regenerate All Thumbnails'}
                  </button>
                  <span className="settings-help">
                    {regenerateAssetCountLabel} will be re-rendered using the
                    settings above. Each model uses its current default texture
                    set / material.
                  </span>
                </div>
              </div>
            )}

            {currentSection.key === 'textureProxy' && (
              <div className="section-fields">
                <div className="settings-field">
                  <label htmlFor="textureProxySize">
                    Web proxy resolution
                    {isFieldDirty('textureProxySize') && (
                      <span className="settings-dirty-indicator">
                        <span className="unsaved-dot" />
                      </span>
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

            {currentSection.key === 'blender' && (
              <div className="section-fields">
                {isDemo ? (
                  <div className="section-locked-notice">
                    <i className="pi pi-lock" />
                    <span>Blender management is disabled in demo mode.</span>
                  </div>
                ) : (
                  <>
                    <div className="settings-field">
                      <label>What is Blender CLI?</label>
                      <p className="settings-help">
                        Blender is an open-source 3D creation suite. When
                        installed, Modelibr uses Blender&apos;s command-line
                        interface to import <code>.blend</code> files (via
                        upload or WebDAV) and to render thumbnails.
                      </p>
                    </div>

                    <div className="settings-field">
                      <label>Blender version</label>
                      <div className="blender-version-row">
                        <select
                          value={selectedVersion}
                          onChange={e => setSelectedVersion(e.target.value)}
                          disabled={isBlenderBusy || blenderVersionsOffline}
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
                              disabled={!selectedVersion}
                              className="btn btn-primary btn-sm"
                            >
                              <i className="pi pi-sync" /> Switch
                            </button>
                          ) : blenderStatus.state !== 'installed' &&
                            !isBlenderBusy ? (
                            <button
                              type="button"
                              onClick={handleInstallBlender}
                              disabled={!selectedVersion}
                              className="btn btn-primary btn-sm"
                            >
                              <i className="pi pi-download" /> Install
                            </button>
                          ) : null)}

                        {blenderStatus.state === 'installed' && (
                          <button
                            type="button"
                            onClick={handleUninstallBlender}
                            className="btn btn-danger btn-sm"
                          >
                            <i className="pi pi-trash" /> Uninstall
                          </button>
                        )}
                      </div>

                      {blenderVersionsOffline && (
                        <span className="blender-status-none">
                          No internet connection — version list unavailable.
                          {blenderStatus.state === 'installed'
                            ? ' Currently installed version can still be used.'
                            : ' Connect to the internet to download Blender.'}
                        </span>
                      )}

                      {blenderStatus.state === 'installed' && (
                        <span className="blender-status-installed">
                          <i className="pi pi-check-circle" /> Installed (v
                          {blenderStatus.installedVersion})
                        </span>
                      )}

                      {blenderStatus.state === 'none' &&
                        !blenderVersionsOffline && (
                          <span className="blender-status-none">
                            Not installed — select a version and click Install.
                          </span>
                        )}

                      {blenderStatus.state === 'failed' && (
                        <span className="blender-status-failed">
                          <i className="pi pi-times-circle" /> Installation
                          failed: {blenderStatus.error}
                        </span>
                      )}

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
                              ? `Downloading… ${blenderStatus.progress}% (${formatBytes(blenderStatus.downloadedBytes)} / ${formatBytes(blenderStatus.totalBytes)})`
                              : 'Extracting…'}
                          </span>
                        </div>
                      )}

                      <span className="settings-help">
                        Only one Blender version can be installed at a time.
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {currentSection.key === 'ssl' && (
              <div className="section-fields">
                <SslCertField webDavUrls={webDavUrls} />
              </div>
            )}

            {currentSection.key === 'webdav' && (
              <div className="section-fields">
                <WebDavSectionContent
                  webDavUrls={webDavUrls}
                  probeResults={probeResults}
                  probeLoading={probeLoading}
                />
              </div>
            )}

            {currentSection.key === 'backup' && (
              <div className="section-fields backup-section-body">
                {isDemo ? (
                  <div className="section-locked-notice">
                    <i className="pi pi-lock" />
                    <span>Backup & Restore is disabled in demo mode.</span>
                  </div>
                ) : (
                  <BackupsSection />
                )}
              </div>
            )}
          </div>

          {currentSection.hasFormSave && (
            <div className="section-detail-footer">
              {successMessage && (
                <span className="saved-notice">
                  <i className="pi pi-check" /> {successMessage}
                </span>
              )}
              {sectionDirty && !hasValidationErrors() && !successMessage && (
                <span className="settings-unsaved-changes">
                  <span className="unsaved-dot" /> Unsaved changes
                </span>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDiscard}
                disabled={isSaving || !sectionDirty}
              >
                Discard
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving || !hasChanges() || hasValidationErrors()}
              >
                <i className="pi pi-save" />
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </form>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────
  // Grid view
  // ────────────────────────────────────────────────────────────────────
  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <div className="settings-search-wrap" ref={searchWrapRef}>
          <i className="pi pi-search" />
          <input
            type="text"
            className="settings-search"
            placeholder="Search settings…"
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((r, i) => (
                <div
                  key={`${r.sectionKey}-${i}`}
                  className="search-result-item"
                  onMouseDown={e => {
                    e.preventDefault()
                    handleSelectSection(r.sectionKey)
                  }}
                >
                  <span className="search-result-category">
                    {r.sectionLabel}
                  </span>
                  <span className="search-result-label">
                    {highlight(r.label, search.trim())}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="settings-error">
          <strong>Error:</strong> {error}
        </div>
      )}
      {successMessage && (
        <div className="settings-success">{successMessage}</div>
      )}

      <div className="settings-grid-area">
        <div className="settings-grid">
          {SECTIONS.map(section => {
            const dimmed = !matchingSectionKeys.has(section.key)
            const locked = isDemo && section.demoLocked
            return (
              <button
                type="button"
                key={section.key}
                className={`setting-card ${dimmed ? 'dimmed' : ''} ${locked ? 'locked' : ''}`}
                onClick={() => {
                  if (locked) return
                  handleSelectSection(section.key)
                }}
                disabled={locked}
              >
                <div className="card-icon">
                  <i className={`pi ${section.icon}`} />
                  {locked && (
                    <i className="pi pi-lock card-lock" aria-hidden="true" />
                  )}
                </div>
                <div className="card-title">{section.label}</div>
                <div className="card-desc">{section.desc}</div>
                {locked && (
                  <div className="card-locked-note">Disabled in demo mode</div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Helper components
// ──────────────────────────────────────────────────────────────────────

interface ToggleFieldProps {
  id?: string
  label: string
  help?: string
  isOn: boolean
  dirty: boolean
  registerProps: ReturnType<ReturnType<typeof useForm>['register']>
}

function ToggleField({
  id,
  label,
  help,
  isOn,
  dirty,
  registerProps,
}: ToggleFieldProps): JSX.Element {
  return (
    <div className="settings-field">
      <label className="settings-checkbox-label toggle-field">
        <input
          id={id}
          type="checkbox"
          className="toggle-field-input"
          {...registerProps}
        />
        <span className="toggle-field-text">
          <span className="toggle-field-label">{label}</span>
          {dirty && (
            <span className="settings-dirty-indicator">
              <span className="unsaved-dot" />
            </span>
          )}
          {help && <span className="toggle-field-sub">{help}</span>}
        </span>
        <span
          className={`toggle-switch ${isOn ? 'on' : ''}`}
          aria-hidden="true"
        />
      </label>
    </div>
  )
}

function SslCertField({
  webDavUrls,
}: {
  webDavUrls: WebDavUrlEntry[]
}): JSX.Element {
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
    <div className="settings-field">
      <label>Self-signed certificate</label>
      <div>
        <a
          href={certUrl}
          download="modelibr-selfsigned.crt"
          className="btn btn-outline"
        >
          <i className="pi pi-download" /> Download SSL certificate
        </a>
      </div>
      <span className="settings-help">
        Install this certificate to trust Modelibr&apos;s self-signed HTTPS
        certificate. Required to stop browser warnings and to use Windows WebDAV
        over HTTPS.
        <br />
        <strong>Windows:</strong> double-click → <em>Install Certificate</em> →{' '}
        <em>Local Machine</em> → <em>Trusted Root Certification Authorities</em>
        <br />
        <strong>macOS:</strong> double-click → open in <em>Keychain Access</em>{' '}
        → set to <em>Always Trust</em>
        <br />
        <strong>Firefox:</strong> Settings → <em>Privacy &amp; Security</em> →{' '}
        <em>Certificates</em> → <em>View Certificates…</em> →{' '}
        <em>Authorities</em> → Import the downloaded file
        {httpsEntry && (
          <>
            <br />
            After trusting, <code>\\{hostname}@SSL\modelibr</code> will work in
            Windows Explorer.
          </>
        )}
        {!baseEntry && (
          <>
            <br />
            Configure <code>WEBDAV_HTTPS_PORT</code> or{' '}
            <code>WEBDAV_HTTP_PORT</code> in <code>.env</code> to get the
            correct download URL.
          </>
        )}
      </span>
    </div>
  )
}

function WebDavSectionContent({
  webDavUrls,
  probeResults,
  probeLoading,
}: {
  webDavUrls: WebDavUrlEntry[]
  probeResults: Record<
    string,
    { reachable: boolean; folderCount: number; error?: string }
  >
  probeLoading: boolean
}): JSX.Element {
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  return (
    <>
      <div className="settings-field">
        <label>WebDAV connectivity</label>
        {probeLoading ? (
          <span className="blender-status-none">Checking connectivity…</span>
        ) : webDavUrls.length === 0 ? (
          <span className="blender-status-none settings-help">
            No WebDAV ports configured. Set <code>WEBDAV_HTTP_PORT</code> or{' '}
            <code>WEBDAV_HTTPS_PORT</code> in <code>.env</code> and restart.
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
                      <code>{entry.url.replace(/\/$/, '')}/modelibr</code>
                      <span className="webdav-url-row-tag">{entry.label}</span>
                      {isPreferred && (
                        <span className="webdav-url-row-tag tag-preferred">
                          preferred
                        </span>
                      )}
                    </span>
                    {result ? (
                      result.reachable ? (
                        <span className="blender-status-installed webdav-status-badge">
                          <i className="pi pi-check" /> Reachable (
                          {result.folderCount} folder
                          {result.folderCount !== 1 ? 's' : ''})
                        </span>
                      ) : (
                        <span className="blender-status-failed webdav-status-badge">
                          <i className="pi pi-times" />{' '}
                          {result.error ?? 'Not reachable'}
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
          HTTP is preferred for local-network use. To change ports or disable a
          protocol, edit <code>WEBDAV_HTTP_PORT</code> /{' '}
          <code>WEBDAV_HTTPS_PORT</code> in <code>.env</code> and restart
          Docker.
        </span>
      </div>

      <div className="settings-field">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setInstructionsOpen(v => !v)}
          aria-expanded={instructionsOpen}
        >
          <i
            className={`pi ${instructionsOpen ? 'pi-chevron-down' : 'pi-chevron-right'}`}
          />
          How to map as a network drive
        </button>
        {instructionsOpen && (
          <div className="settings-info-box">
            <WebDavInstructions />
          </div>
        )}
      </div>
    </>
  )
}
