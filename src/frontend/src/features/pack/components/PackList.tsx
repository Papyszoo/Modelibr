import { useState, useEffect } from 'react'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import ApiClient from '../../../services/ApiClient'
import { PackDto } from '../../../types'
import { openTabInPanel } from '../../../utils/tabNavigation'
import './PackList.css'

export default function PackList() {
  const [packs, setPacks] = useState<PackDto[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newPackName, setNewPackName] = useState('')
  const [newPackDescription, setNewPackDescription] = useState('')
  const toast = useRef<Toast>(null)

  useEffect(() => {
    loadPacks()
  }, [])

  const loadPacks = async () => {
    try {
      setLoading(true)
      const data = await ApiClient.getAllPacks()
      setPacks(data)
    } catch (error) {
      console.error('Failed to load packs:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load packs',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePack = async () => {
    if (!newPackName.trim()) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validation Error',
        detail: 'Pack name is required',
        life: 3000,
      })
      return
    }

    try {
      await ApiClient.createPack({
        name: newPackName.trim(),
        description: newPackDescription.trim() || undefined,
      })

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Pack created successfully',
        life: 3000,
      })

      setShowCreateDialog(false)
      setNewPackName('')
      setNewPackDescription('')
      loadPacks()
    } catch (error) {
      console.error('Failed to create pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create pack',
        life: 3000,
      })
    }
  }

  const handleDeletePack = async (packId: number) => {
    try {
      await ApiClient.deletePack(packId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Pack deleted successfully',
        life: 3000,
      })
      loadPacks()
    } catch (error) {
      console.error('Failed to delete pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete pack',
        life: 3000,
      })
    }
  }

  const getPackThumbnail = (pack: PackDto) => {
    // TODO: Add pack thumbnail support
    // For now, return null - will be implemented when thumbnail upload is added
    return null
  }

  return (
    <div className="pack-list">
      <Toast ref={toast} />

      <div className="pack-list-header">
        <h2>Packs</h2>
        <Button
          label="Create Pack"
          icon="pi pi-plus"
          onClick={() => setShowCreateDialog(true)}
        />
      </div>

      {loading ? (
        <div className="pack-list-loading">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }} />
          <p>Loading packs...</p>
        </div>
      ) : packs.length === 0 ? (
        <div className="pack-list-empty">
          <i className="pi pi-box" style={{ fontSize: '3rem' }} />
          <h3>No Packs Yet</h3>
          <p>Create your first pack to organize models and texture sets</p>
          <Button
            label="Create Pack"
            icon="pi pi-plus"
            onClick={() => setShowCreateDialog(true)}
          />
        </div>
      ) : (
        <div className="pack-grid">
          {packs.map(pack => {
            const thumbnail = getPackThumbnail(pack)
            return (
              <div
                key={pack.id}
                className="pack-grid-card"
                onClick={() => {
                  openTabInPanel('packViewer', 'left', pack.id.toString(), pack.name)
                }}
              >
                <div className="pack-grid-card-image">
                  {thumbnail ? (
                    <img src={thumbnail} alt={pack.name} />
                  ) : (
                    <div className="pack-grid-card-placeholder">
                      <i className="pi pi-box" />
                    </div>
                  )}
                </div>
                <div className="pack-grid-card-content">
                  <h3 className="pack-grid-card-title">{pack.name}</h3>
                  {pack.description && (
                    <p className="pack-grid-card-description">
                      {pack.description}
                    </p>
                  )}
                  <div className="pack-grid-card-stats">
                    <span>
                      <i className="pi pi-cube" /> {pack.modelCount}
                    </span>
                    <span>
                      <i className="pi pi-palette" /> {pack.textureSetCount}
                    </span>
                    <span>
                      <i className="pi pi-image" /> {pack.spriteCount}
                    </span>
                  </div>
                </div>
                <div className="pack-grid-card-actions">
                  <Button
                    icon="pi pi-trash"
                    className="p-button-text p-button-rounded p-button-danger p-button-sm"
                    tooltip="Delete Pack"
                    onClick={e => {
                      e.stopPropagation()
                      handleDeletePack(pack.id)
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog
        header="Create New Pack"
        visible={showCreateDialog}
        style={{ width: '500px' }}
        onHide={() => {
          setShowCreateDialog(false)
          setNewPackName('')
          setNewPackDescription('')
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                setShowCreateDialog(false)
                setNewPackName('')
                setNewPackDescription('')
              }}
              className="p-button-text"
            />
            <Button
              label="Create"
              icon="pi pi-check"
              onClick={handleCreatePack}
              autoFocus
            />
          </div>
        }
      >
        <div className="p-fluid">
          <div className="field">
            <label htmlFor="pack-name">Name *</label>
            <InputText
              id="pack-name"
              value={newPackName}
              onChange={e => setNewPackName(e.target.value)}
              placeholder="Enter pack name"
            />
          </div>
          <div className="field">
            <label htmlFor="pack-description">Description</label>
            <InputTextarea
              id="pack-description"
              value={newPackDescription}
              onChange={e => setNewPackDescription(e.target.value)}
              rows={3}
              placeholder="Enter pack description (optional)"
            />
          </div>
        </div>
      </Dialog>
    </div>
  )
}
