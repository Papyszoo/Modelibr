import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Checkbox } from 'primereact/checkbox'
import { Model } from '../../../types'

export interface ModelAssociation {
  model: Model
  isAssociated: boolean
  originallyAssociated: boolean
}

interface ModelAssociationTableProps {
  modelAssociations: ModelAssociation[]
  loading: boolean
  onToggleAssociation: (modelId: string, isAssociated: boolean) => void
}

export default function ModelAssociationTable({
  modelAssociations,
  loading,
  onToggleAssociation,
}: ModelAssociationTableProps) {
  const associationBodyTemplate = (rowData: ModelAssociation) => {
    return (
      <Checkbox
        inputId={`model-${rowData.model.id}`}
        checked={rowData.isAssociated}
        onChange={e =>
          onToggleAssociation(rowData.model.id, e.checked || false)
        }
      />
    )
  }

  const statusBodyTemplate = (rowData: ModelAssociation) => {
    if (rowData.isAssociated && !rowData.originallyAssociated) {
      return <span className="status-badge status-new">Will Associate</span>
    } else if (!rowData.isAssociated && rowData.originallyAssociated) {
      return <span className="status-badge status-remove">Will Remove</span>
    } else if (rowData.isAssociated) {
      return (
        <span className="status-badge status-current">
          Currently Associated
        </span>
      )
    }
    return <span className="status-badge status-none">Not Associated</span>
  }

  const fileCountBodyTemplate = (rowData: ModelAssociation) => {
    return `${rowData.model.files.length} file${
      rowData.model.files.length !== 1 ? 's' : ''
    }`
  }

  return (
    <DataTable
      value={modelAssociations}
      loading={loading}
      emptyMessage="No models available"
      paginator
      rows={15}
      responsiveLayout="scroll"
      stripedRows
      showGridlines
      className="model-association-table"
    >
      <Column
        field="isAssociated"
        header="Associate"
        body={associationBodyTemplate}
        style={{ width: '100px', textAlign: 'center' }}
      />
      <Column
        field="model.name"
        header="Model Name"
        sortable
        style={{ minWidth: '200px' }}
      />
      <Column
        header="Files"
        body={fileCountBodyTemplate}
        style={{ minWidth: '100px' }}
      />
      <Column
        header="Status"
        body={statusBodyTemplate}
        style={{ minWidth: '150px' }}
      />
    </DataTable>
  )
}
