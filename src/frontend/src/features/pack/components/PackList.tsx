import { useState, useEffect } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import ApiClient from '../../../services/ApiClient'
import { PackDto } from '../../../types'
import { useTabContext } from '../../../hooks/useTabContext'
import './PackList.css'

export default function PackList() {
  const [packs, setPacks] = useState<PackDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newPackName, setNewPackName] = useState('')
  const [newPackDescription, setNewPackDescription] = useState('')
  const toast = useRef<Toast>(null)
  const { openTab } = useTabContext()

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

  const actionBodyTemplate = (rowData: PackDto) => {
    return (
      <div className="flex gap-2">
        <Button
          icon="pi pi-eye"
          className="p-button-text p-button-rounded"
          tooltip="View Pack"
          onClick={() => {
            openTab('packViewer', rowData.name, { id: rowData.id.toString() })
          }}
        />
        <Button
          icon="pi pi-trash"
          className="p-button-text p-button-rounded p-button-danger"
          tooltip="Delete Pack"
          onClick={() => handleDeletePack(rowData.id)}
        />
      </div>
    )
  }

  const contentBodyTemplate = (rowData: PackDto) => {
    return (
      <div>
        {rowData.modelCount} models, {rowData.textureSetCount} texture sets
      </div>
    )
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

      <DataTable
        value={packs}
        loading={loading}
        emptyMessage="No packs found"
        responsiveLayout="scroll"
        stripedRows
        showGridlines
      >
        <Column field="name" header="Name" sortable style={{ minWidth: '200px' }} />
        <Column field="description" header="Description" style={{ minWidth: '300px' }} />
        <Column body={contentBodyTemplate} header="Content" style={{ minWidth: '150px' }} />
        <Column
          field="createdAt"
          header="Created"
          sortable
          body={(rowData) => new Date(rowData.createdAt).toLocaleDateString()}
          style={{ minWidth: '120px' }}
        />
        <Column body={actionBodyTemplate} header="Actions" style={{ width: '120px' }} />
      </DataTable>

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
              onChange={(e) => setNewPackName(e.target.value)}
              placeholder="Enter pack name"
            />
          </div>
          <div className="field">
            <label htmlFor="pack-description">Description</label>
            <InputTextarea
              id="pack-description"
              value={newPackDescription}
              onChange={(e) => setNewPackDescription(e.target.value)}
              rows={3}
              placeholder="Enter pack description (optional)"
            />
          </div>
        </div>
      </Dialog>
    </div>
  )
}
