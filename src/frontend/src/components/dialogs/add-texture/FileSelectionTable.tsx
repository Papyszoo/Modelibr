import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'

export interface FileOption {
  id: number
  name: string
  mimeType: string
  sizeBytes: number
}

interface FileSelectionTableProps {
  files: FileOption[]
  loading: boolean
  selectedFileId: number | null
  onFileSelect: (fileId: number | null) => void
}

export default function FileSelectionTable({
  files,
  loading,
  selectedFileId,
  onFileSelect,
}: FileSelectionTableProps) {
  const fileSizeBodyTemplate = (rowData: FileOption) => {
    return `${(rowData.sizeBytes / 1024).toFixed(1)} KB`
  }

  return (
    <div className="p-field">
      <label htmlFor="file-selection" className="p-text-bold">
        Select File <span className="p-error">*</span>
      </label>
      <DataTable
        value={files}
        loading={loading}
        selectionMode="single"
        selection={files.find(f => f.id === selectedFileId) || null}
        onSelectionChange={e => onFileSelect(e.value?.id || null)}
        emptyMessage="No image files available"
        paginator
        rows={10}
        responsiveLayout="scroll"
        stripedRows
        showGridlines
        className="file-selection-table"
      >
        <Column selectionMode="single" style={{ width: '3rem' }} />
        <Column
          field="name"
          header="File Name"
          sortable
          style={{ minWidth: '200px' }}
        />
        <Column
          field="mimeType"
          header="Type"
          sortable
          style={{ minWidth: '120px' }}
        />
        <Column
          field="sizeBytes"
          header="Size"
          body={fileSizeBodyTemplate}
          sortable
          style={{ minWidth: '100px' }}
        />
      </DataTable>
      <small className="p-text-secondary">
        Select an image file to use as a texture. Only image files from
        uploaded models are shown.
      </small>
    </div>
  )
}