import { Button } from 'primereact/button'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { ModelSummaryDto } from '@/types'

interface ModelsTableProps {
  models: ModelSummaryDto[]
  onDisassociateModel: (model: ModelSummaryDto) => void
  onManageAssociations: () => void
}

export function ModelsTable({
  models,
  onDisassociateModel,
  onManageAssociations,
}: ModelsTableProps) {
  const modelActionsBodyTemplate = (rowData: ModelSummaryDto) => {
    return (
      <Button
        icon="pi pi-times"
        className="p-button-text p-button-rounded p-button-danger p-button-sm"
        onClick={() => onDisassociateModel(rowData)}
        tooltip="Disassociate from pack"
      />
    )
  }

  return (
    <>
      <div className="tab-header">
        <h4>Associated Models</h4>
        <Button
          label="Manage Associations"
          icon="pi pi-link"
          onClick={onManageAssociations}
          size="small"
        />
      </div>

      <DataTable
        value={models}
        emptyMessage="No models associated with this pack"
        responsiveLayout="scroll"
        stripedRows
        showGridlines
      >
        <Column
          field="name"
          header="Model Name"
          sortable
          style={{ minWidth: '200px' }}
        />
        <Column
          body={modelActionsBodyTemplate}
          header="Actions"
          style={{ width: '80px' }}
        />
      </DataTable>
    </>
  )
}
