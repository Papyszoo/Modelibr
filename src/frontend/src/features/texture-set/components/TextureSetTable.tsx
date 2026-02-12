import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { TextureSetDto, TextureDto } from '@/types'
import {
  getTextureTypeLabel,
  getTextureTypeColor,
  getTextureTypeIcon,
} from '@/utils/textureTypeUtils'

interface TextureSetTableProps {
  textureSets: TextureSetDto[]
  loading: boolean
  onViewDetails: (set: TextureSetDto) => void
  onDeleteSet: (set: TextureSetDto) => void
}

export default function TextureSetTable({
  textureSets,
  loading,
  onViewDetails,
  onDeleteSet,
}: TextureSetTableProps) {
  const nameBodyTemplate = (rowData: TextureSetDto) => {
    return (
      <div className="texture-set-name">
        <strong>{rowData.name}</strong>
        {rowData.isEmpty && <span className="empty-badge">Empty</span>}
      </div>
    )
  }

  const texturesBodyTemplate = (rowData: TextureSetDto) => {
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

  const modelsBodyTemplate = (rowData: TextureSetDto) => {
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

  const dateBodyTemplate = (rowData: TextureSetDto) => {
    return new Date(rowData.updatedAt).toLocaleDateString()
  }

  const actionsBodyTemplate = (rowData: TextureSetDto) => {
    return (
      <div className="texture-set-actions">
        <Button
          icon="pi pi-eye"
          className="p-button-text p-button-rounded"
          onClick={() => onViewDetails(rowData)}
          tooltip="View Details"
        />
        <Button
          icon="pi pi-trash"
          className="p-button-text p-button-rounded p-button-danger"
          onClick={() => onDeleteSet(rowData)}
          tooltip="Delete"
        />
      </div>
    )
  }

  return (
    <div className="texture-set-list-content">
      <DataTable
        value={textureSets}
        loading={loading}
        responsiveLayout="scroll"
        stripedRows
        showGridlines
        emptyMessage="No texture sets found"
        paginator
        rows={10}
        rowsPerPageOptions={[5, 10, 25, 50]}
        className="texture-set-table"
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
  )
}
