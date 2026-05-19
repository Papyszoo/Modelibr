import { confirmDialog } from 'primereact/confirmdialog'
import { type JSX, useCallback, useEffect, useState } from 'react'

import {
  type BackupSizeEstimate,
  type BackupStorageInfo,
  type BackupSummary,
  createBackup,
  deleteBackup,
  getBackupDownloadUrl,
  getBackupSizeEstimate,
  getBackupStorageInfo,
  listBackups,
  stageRestore,
} from './api/backupsApi'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

interface CreateModalProps {
  estimate: BackupSizeEstimate | null
  onCancel: () => void
  onCreate: (includeThumbnails: boolean) => Promise<void>
  isSubmitting: boolean
}

function CreateBackupModal({
  estimate,
  onCancel,
  onCreate,
  isSubmitting,
}: CreateModalProps): JSX.Element {
  const [includeThumbnails, setIncludeThumbnails] = useState(false)

  const projected =
    estimate == null
      ? null
      : estimate.databaseBytes +
        estimate.uploadsBytes +
        (includeThumbnails ? estimate.thumbnailsBytes : 0)

  return (
    <div className="backups-modal-overlay" role="dialog" aria-modal="true">
      <div className="backups-modal">
        <h3 className="backups-modal-title">Create backup</h3>
        <div className="backups-modal-body">
          <p className="backups-modal-intro">Include:</p>

          <label className="settings-checkbox-label">
            <input type="checkbox" checked disabled />
            <span>
              Database <em>(always — required)</em>
              {estimate && (
                <span className="backups-modal-size">
                  ~{formatBytes(estimate.databaseBytes)}
                </span>
              )}
            </span>
          </label>

          <label className="settings-checkbox-label">
            <input type="checkbox" checked disabled />
            <span>
              Uploaded files <em>(always — required)</em>
              {estimate && (
                <span className="backups-modal-size">
                  ~{formatBytes(estimate.uploadsBytes)}
                </span>
              )}
            </span>
          </label>

          <label className="settings-checkbox-label">
            <input
              type="checkbox"
              checked={includeThumbnails}
              onChange={e => setIncludeThumbnails(e.target.checked)}
              disabled={isSubmitting}
            />
            <span>
              Thumbnails <em>(optional)</em>
              {estimate && (
                <span className="backups-modal-size">
                  ~{formatBytes(estimate.thumbnailsBytes)}
                </span>
              )}
            </span>
          </label>
          <span className="settings-help backups-modal-help">
            Auto-generated thumbnails can be regenerated, but custom-uploaded
            thumbnails cannot — include this if you've uploaded custom ones.
          </span>

          {projected != null && (
            <div className="backups-modal-estimate">
              Projected archive size: <strong>~{formatBytes(projected)}</strong>
            </div>
          )}
        </div>

        <div className="backups-modal-actions">
          <button
            type="button"
            className="settings-button settings-button-secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="settings-button settings-button-primary"
            onClick={() => void onCreate(includeThumbnails)}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Starting…' : 'Create backup'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function BackupsSection(): JSX.Element {
  const [backups, setBackups] = useState<BackupSummary[]>([])
  const [storage, setStorage] = useState<BackupStorageInfo | null>(null)
  const [estimate, setEstimate] = useState<BackupSizeEstimate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [list, store] = await Promise.all([
        listBackups(),
        getBackupStorageInfo(),
      ])
      setBackups(list.backups)
      setStorage(store)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backups')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll while a backup is in progress.
  useEffect(() => {
    const hasInProgress = backups.some(b => b.status === 'in_progress')
    if (!hasInProgress) return
    const interval = setInterval(() => {
      void refresh()
    }, 2000)
    return () => clearInterval(interval)
  }, [backups, refresh])

  const openCreate = async () => {
    setShowCreate(true)
    try {
      const e = await getBackupSizeEstimate()
      setEstimate(e)
    } catch {
      setEstimate(null)
    }
  }

  const handleCreate = async (includeThumbnails: boolean) => {
    setIsCreating(true)
    setError(null)
    setInfo(null)
    try {
      const created = await createBackup(includeThumbnails)
      setInfo(`Backup ${created.fileName} started.`)
      setShowCreate(false)
      void refresh()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to start backup'
      )
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = (fileName: string) => {
    confirmDialog({
      message: `Delete backup ${fileName}? This frees disk space but cannot be undone.`,
      header: 'Delete backup',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await deleteBackup(fileName)
          setInfo(`Deleted ${fileName}.`)
          void refresh()
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to delete backup'
          )
        }
      },
    })
  }

  const handleRestore = (fileName: string) => {
    confirmDialog({
      message: `Restore ${fileName}? On next webapi restart this backup will REPLACE the current database and uploads. The existing data will be preserved in pre-restore directories until the restore completes successfully.`,
      header: 'Stage backup for restore',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Stage restore',
      rejectLabel: 'Cancel',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          const result = await stageRestore(fileName)
          setInfo(result.message)
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to stage restore'
          )
        }
      },
    })
  }

  return (
    <div className="settings-section-content backups-section">
      {error && (
        <div className="settings-error">
          <strong>Error:</strong> {error}
        </div>
      )}
      {info && <div className="settings-success">{info}</div>}

      <div className="backups-toolbar">
        <button
          type="button"
          onClick={() => void openCreate()}
          className="settings-button settings-button-primary"
          disabled={backups.some(b => b.status === 'in_progress')}
        >
          Create backup
        </button>
        {storage && (
          <span className="settings-help backups-storage-line">
            <code>{storage.hostPath}</code> on host —{' '}
            <strong>{formatBytes(storage.totalUsedBytes)}</strong> used by{' '}
            {backups.length} archive{backups.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="settings-help">Loading backups…</div>
      ) : backups.length === 0 ? (
        <div className="settings-help backups-empty">
          No backups yet. Click <em>Create backup</em> to make the first one.
        </div>
      ) : (
        <table className="backups-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Created</th>
              <th>Size</th>
              <th>Contents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.fileName} className={`backups-row backups-row--${b.status}`}>
                <td>
                  <div className="backups-filename">{b.fileName}</div>
                  <div className="backups-pathline">
                    <code>{b.hostPath}</code>
                  </div>
                </td>
                <td>{formatDate(b.createdAtUtc)}</td>
                <td>
                  {b.status === 'in_progress'
                    ? '—'
                    : formatBytes(b.sizeBytes)}
                </td>
                <td>
                  DB + uploads
                  {b.includesThumbnails ? ' + thumbnails' : ''}
                </td>
                <td className="backups-actions">
                  {b.status === 'in_progress' ? (
                    <span className="backups-badge backups-badge--progress">
                      Creating…
                    </span>
                  ) : b.status === 'failed' ? (
                    <span
                      className="backups-badge backups-badge--failed"
                      title={b.error ?? ''}
                    >
                      Failed
                    </span>
                  ) : (
                    <>
                      <a
                        className="settings-button-small primary"
                        href={getBackupDownloadUrl(b.fileName)}
                        download={b.fileName}
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="settings-button-small"
                        onClick={() => handleRestore(b.fileName)}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="settings-button-small danger"
                        onClick={() => handleDelete(b.fileName)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details className="backups-help-details">
        <summary>About backup and restore</summary>
        <ul>
          <li>
            Backups are stored on the server at{' '}
            <code>{storage?.hostPath ?? './data/backups'}</code>. Copy the file
            off-host (scp, rsync, NAS, S3) to satisfy the 3-2-1 rule.
          </li>
          <li>
            Restore works by staging the archive into <code>./data/restore/</code>{' '}
            and restarting the webapi container. On boot, the database and
            uploads are replaced; pre-existing data is preserved in{' '}
            <code>.pre-restore-*</code> directories until the restore
            completes successfully.
          </li>
          <li>
            Postgres major version of the backup must match the running server
            (currently 16). Mismatched archives are moved to{' '}
            <code>./data/restore/failed/</code> without touching live data.
          </li>
        </ul>
      </details>

      {showCreate && (
        <CreateBackupModal
          estimate={estimate}
          onCancel={() => setShowCreate(false)}
          onCreate={handleCreate}
          isSubmitting={isCreating}
        />
      )}
    </div>
  )
}
