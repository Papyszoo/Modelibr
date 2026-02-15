import { Button } from 'primereact/button'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { TextureDto } from '@/types'
import {
  getTextureTypeLabel,
  getTextureTypeColor,
  getTextureTypeIcon,
} from '../../../utils/textureTypeUtils'

interface TexturesTableProps {
  textures: TextureDto[]
  onRemoveTexture: (texture: TextureDto) => void
  onAddTexture: () => void
}

export function TexturesTable({
  textures,
  onRemoveTexture,
  onAddTexture,
}: TexturesTableProps) {
  const textureTypeBodyTemplate = (rowData: TextureDto) => {
    return (
      <span
        className="texture-type-badge"
        style={{ backgroundColor: getTextureTypeColor(rowData.textureType) }}
      >
        <i className={`pi ${getTextureTypeIcon(rowData.textureType)}`}></i>
        {getTextureTypeLabel(rowData.textureType)}
      </span>
    )
  }

  const textureDateBodyTemplate = (rowData: TextureDto) => {
    return new Date(rowData.createdAt).toLocaleDateString()
  }

  const textureActionsBodyTemplate = (rowData: TextureDto) => {
    return (
      <Button
        icon="pi pi-trash"
        className="p-button-text p-button-rounded p-button-danger p-button-sm"
        onClick={() => onRemoveTexture(rowData)}
        tooltip="Remove from pack"
      />
    )
  }

  return (
    <>
      <div className="tab-header">
        <h4>Textures in Pack</h4>
        <Button
          label="Add Texture"
          icon="pi pi-plus"
          onClick={onAddTexture}
          size="small"
        />
      </div>

      <DataTable
        value={textures}
        emptyMessage="No textures in this pack"
        responsiveLayout="scroll"
        stripedRows
        showGridlines
      >
        <Column
          field="fileName"
          header="File Name"
          sortable
          style={{ minWidth: '200px' }}
        />
        <Column
          header="Type"
          body={textureTypeBodyTemplate}
          sortable
          sortField="textureType"
          style={{ minWidth: '150px' }}
        />
        <Column
          field="createdAt"
          header="Added"
          body={textureDateBodyTemplate}
          sortable
          style={{ minWidth: '120px' }}
        />
        <Column
          body={textureActionsBodyTemplate}
          header="Actions"
          style={{ width: '80px' }}
        />
      </DataTable>
    </>
  )
}
