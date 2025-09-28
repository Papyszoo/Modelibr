import { useState, useEffect, useCallback } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import { TexturePackDto, TextureDto } from '../../types'
import {
  getTextureTypeLabel,
  getTextureTypeColor,
  getTextureTypeIcon,
} from '../../utils/textureTypeUtils'
import { useTexturePacks } from '../../hooks/useTexturePacks'
import CreateTexturePackDialog from '../dialogs/CreateTexturePackDialog'
import TexturePackDetailDialog from '../dialogs/TexturePackDetailDialog'
import './TexturePackList.css'

function TexturePackList() {
  const [texturePacks, setTexturePacks] = useState<TexturePackDto[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTexturePack, setSelectedTexturePack] =
    useState<TexturePackDto | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const toast = useRef<Toast>(null)
  const texturePacksApi = useTexturePacks()

  const loadTexturePacks = useCallback(async () => {
    try {
      setLoading(true)
      const packs = await texturePacksApi.getAllTexturePacks()
      setTexturePacks(packs || [])
    } catch (error) {
      console.error('Failed to load texture packs:', error)
      setTexturePacks([]) // Ensure texturePacks is always an array
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load texture packs',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [texturePacksApi])

  useEffect(() => {
    loadTexturePacks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreateTexturePack = async (name: string) => {
    try {
      await texturePacksApi.createTexturePack({ name })
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture pack created successfully',
        life: 3000,
      })
      loadTexturePacks()
      setShowCreateDialog(false)
    } catch (error) {
      console.error('Failed to create texture pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create texture pack',
        life: 3000,
      })
    }
  }

  const handleDeleteTexturePack = (texturePack: TexturePackDto) => {
    confirmDialog({
      message: `Are you sure you want to delete the texture pack "${texturePack.name}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await texturePacksApi.deleteTexturePack(texturePack.id)
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Texture pack deleted successfully',
            life: 3000,
          })
          loadTexturePacks()
        } catch (error) {
          console.error('Failed to delete texture pack:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete texture pack',
            life: 3000,
          })
        }
      },
    })
  }

  const handleViewDetails = (texturePack: TexturePackDto) => {
    setSelectedTexturePack(texturePack)
    setShowDetailDialog(true)
  }

  const handlePackUpdated = () => {
    loadTexturePacks()
    setShowDetailDialog(false)
  }

  const nameBodyTemplate = (rowData: TexturePackDto) => {
    return (
      <div className="texture-pack-name">
        <strong>{rowData.name}</strong>
        {rowData.isEmpty && <span className="empty-badge">Empty</span>}
      </div>
    )
  }

  const texturesBodyTemplate = (rowData: TexturePackDto) => {
    if (rowData.isEmpty || !rowData.textures) {
      return <span className="text-muted">No textures</span>
    }

    return (
      <div className="texture-types-preview">
        {rowData.textures.slice(0, 4).map((texture: TextureDto) => (
          <span
            key={texture.id}
            className="texture-type-badge"
            style={{
              backgroundColor: getTextureTypeColor(texture.textureType),
            }}
            title={`${getTextureTypeLabel(texture.textureType)} - ${texture.fileName || 'Unknown'}`}
          >
            <i className={`pi ${getTextureTypeIcon(texture.textureType)}`}></i>
            {getTextureTypeLabel(texture.textureType)}
          </span>
        ))}
        {rowData.textureCount > 4 && (
          <span className="texture-count-more">
            +{rowData.textureCount - 4} more
          </span>
        )}
      </div>
    )
  }

  const modelsBodyTemplate = (rowData: TexturePackDto) => {
    if (!rowData.associatedModels || rowData.associatedModels.length === 0) {
      return <span className="text-muted">No models</span>
    }

    return (
      <div className="associated-models">
        <span className="model-count">
          <i className="pi pi-box"></i>
          {rowData.associatedModels.length} model
          {rowData.associatedModels.length !== 1 ? 's' : ''}
        </span>
      </div>
    )
  }

  const dateBodyTemplate = (rowData: TexturePackDto) => {
    return new Date(rowData.updatedAt).toLocaleDateString()
  }

  const actionsBodyTemplate = (rowData: TexturePackDto) => {
    return (
      <div className="texture-pack-actions">
        <Button
          icon="pi pi-eye"
          className="p-button-text p-button-rounded"
          onClick={() => handleViewDetails(rowData)}
          tooltip="View Details"
        />
        <Button
          icon="pi pi-trash"
          className="p-button-text p-button-rounded p-button-danger"
          onClick={() => handleDeleteTexturePack(rowData)}
          tooltip="Delete"
        />
      </div>
    )
  }

  return (
    <div className="texture-pack-list">
      <Toast ref={toast} />
      <ConfirmDialog />

      <header className="texture-pack-list-header">
        <div className="header-content">
          <h1>Texture Packs</h1>
          <div className="texture-pack-stats">
            <span className="stat-item">
              <i className="pi pi-folder"></i>
              {texturePacks.length} pack{texturePacks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <Button
          label="Create Pack"
          icon="pi pi-plus"
          onClick={() => setShowCreateDialog(true)}
          className="p-button-primary"
        />
      </header>

      <div className="texture-pack-list-content">
        <DataTable
          value={texturePacks}
          loading={loading}
          responsiveLayout="scroll"
          stripedRows
          showGridlines
          emptyMessage="No texture packs found"
          paginator
          rows={10}
          rowsPerPageOptions={[5, 10, 25, 50]}
          className="texture-pack-table"
        >
          <Column
            field="name"
            header="Name"
            body={nameBodyTemplate}
            sortable
            style={{ minWidth: '200px' }}
          />
          <Column
            header="Textures"
            body={texturesBodyTemplate}
            style={{ minWidth: '300px' }}
          />
          <Column
            header="Models"
            body={modelsBodyTemplate}
            style={{ minWidth: '120px' }}
          />
          <Column
            field="updatedAt"
            header="Last Updated"
            body={dateBodyTemplate}
            sortable
            style={{ minWidth: '120px' }}
          />
          <Column
            body={actionsBodyTemplate}
            header="Actions"
            style={{ width: '120px' }}
            frozen
            alignFrozen="right"
          />
        </DataTable>
      </div>

      {showCreateDialog && (
        <CreateTexturePackDialog
          visible={showCreateDialog}
          onHide={() => setShowCreateDialog(false)}
          onSubmit={handleCreateTexturePack}
        />
      )}

      {showDetailDialog && selectedTexturePack && (
        <TexturePackDetailDialog
          visible={showDetailDialog}
          texturePack={selectedTexturePack}
          onHide={() => setShowDetailDialog(false)}
          onPackUpdated={handlePackUpdated}
        />
      )}
    </div>
  )
}

export default TexturePackList
