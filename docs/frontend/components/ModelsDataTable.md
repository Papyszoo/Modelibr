# ModelsDataTable

PrimeReact DataTable component for displaying model list with drag-and-drop support.

## Purpose

Provides a comprehensive model listing with:
- Sortable and filterable data table
- Thumbnail previews
- Pagination
- Drag and drop file upload
- Model action buttons
- Export functionality

## Import

```typescript
import ModelsDataTable from '../components/model-list/ModelsDataTable'
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `models` | `Model[]` | Array of models to display |
| `onModelSelect` | `(model: Model) => void` | Callback when model is selected |
| `isTabContent` | `boolean` | Whether component is in a tab (affects button tooltips) |
| `onDrop` | `(e: React.DragEvent) => void` | Drop event handler |
| `onDragOver` | `(e: React.DragEvent) => void` | Drag over handler |
| `onDragEnter` | `(e: React.DragEvent) => void` | Drag enter handler |
| `onDragLeave` | `(e: React.DragEvent) => void` | Drag leave handler |

## Features

### Data Table

- **Striped rows** for better readability
- **Grid lines** for clear data separation
- **Pagination** with 10 rows per page
- **Responsive layout** adapts to screen size
- **Export to CSV** functionality

### Columns

1. **Thumbnail** - Model preview image
2. **ID** - Model identifier with # prefix
3. **Name** - Model or file name
4. **Format** - File format (e.g., OBJ, GLTF)
5. **Size** - Formatted file size
6. **Created** - Creation date (localized)
7. **Actions** - View/Open button

## Usage Examples

### Basic Usage

```typescript
import ModelsDataTable from '../components/model-list/ModelsDataTable'
import { useDragAndDrop } from '../hooks/useFileUpload'

function ModelList() {
  const [models, setModels] = useState([])

  const handleModelSelect = (model) => {
    console.log('Selected model:', model)
  }

  const handleFilesDropped = (files) => {
    // Handle file upload
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } = 
    useDragAndDrop(handleFilesDropped)

  return (
    <ModelsDataTable
      models={models}
      onModelSelect={handleModelSelect}
      isTabContent={false}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    />
  )
}
```

### In Tab Context

```typescript
import ModelsDataTable from '../components/model-list/ModelsDataTable'
import { useTabContext } from '../hooks/useTabContext'

function ModelListTab() {
  const [models, setModels] = useState([])
  const { openModelDetailsTab } = useTabContext()

  const handleModelSelect = (model) => {
    // Open in new tab
    openModelDetailsTab(model)
  }

  return (
    <ModelsDataTable
      models={models}
      onModelSelect={handleModelSelect}
      isTabContent={true}  // Changes button tooltip
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    />
  )
}
```

### With Data Fetching

```typescript
import { useState, useEffect } from 'react'
import ModelsDataTable from '../components/model-list/ModelsDataTable'
import ApiClient from '../services/ApiClient'

function ModelListWithData() {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await ApiClient.getModels()
        setModels(data)
      } catch (error) {
        console.error('Failed to fetch models:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchModels()
  }, [])

  if (loading) return <div>Loading...</div>

  return (
    <ModelsDataTable
      models={models}
      onModelSelect={handleModelSelect}
      isTabContent={false}
      {...dragHandlers}
    />
  )
}
```

## Column Templates

### Thumbnail Column

```typescript
const thumbnailBodyTemplate = (rowData: Model) => {
  return (
    <ThumbnailDisplay
      modelId={rowData.id}
      size="small"
      alt={`Thumbnail for ${rowData.files?.[0]?.originalFileName || `model ${rowData.id}`}`}
    />
  )
}
```

### ID Column

```typescript
const idBodyTemplate = (rowData: Model) => {
  return `#${rowData.id}`
}
```

### Name Column

```typescript
const nameBodyTemplate = (rowData: Model) => {
  const fileName =
    rowData.files && rowData.files.length > 0
      ? rowData.files[0].originalFileName
      : rowData.name || `Model ${rowData.id}`
  return fileName
}
```

### Format Column

```typescript
const formatBodyTemplate = (rowData: Model) => {
  return getModelFileFormat(rowData)
}
```

### Size Column

```typescript
const sizeBodyTemplate = (rowData: Model) => {
  const totalSize = rowData.files?.reduce(
    (sum, file) => sum + (file.sizeBytes || 0),
    0
  ) || 0
  return formatFileSize(totalSize)
}
```

### Date Column

```typescript
const dateBodyTemplate = (rowData: Model) => {
  return new Date(rowData.createdAt).toLocaleDateString()
}
```

### Actions Column

```typescript
const actionBodyTemplate = (rowData: Model) => {
  return (
    <Button
      icon="pi pi-eye"
      className="p-button-text p-button-rounded"
      onClick={() => onModelSelect(rowData)}
      tooltip={isTabContent ? 'Open in New Tab' : 'View Model'}
    />
  )
}
```

## Drag and Drop

The table container supports drag and drop for file uploads:

```typescript
<div
  className="datatable-container"
  onDrop={onDrop}
  onDragOver={onDragOver}
  onDragEnter={onDragEnter}
  onDragLeave={onDragLeave}
>
  <DataTable {...props} />
</div>
```

### Visual Feedback

When files are dragged over the table:
- Container gets `drag-over` class
- Body gets `dragging-file` class
- Visual indicator shows drop is allowed

## Export Functionality

The table includes CSV export:

```typescript
const exportCSV = () => {
  dt.current?.exportCSV()
}

// In header or toolbar
<Button 
  icon="pi pi-download" 
  onClick={exportCSV}
  tooltip="Export to CSV"
/>
```

## DataTable Configuration

```typescript
<DataTable
  ref={dt}
  value={models}
  responsiveLayout="scroll"
  stripedRows
  showGridlines
  paginator
  rows={10}
  rowsPerPageOptions={[10, 25, 50]}
  paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
  currentPageReportTemplate="Showing {first} to {last} of {totalRecords} models"
>
  {/* Columns */}
</DataTable>
```

## Styling

### Container

```css
.datatable-container {
  width: 100%;
  padding: 1rem;
}

.datatable-container.drag-over {
  background: #f0f9ff;
  border: 2px dashed #3b82f6;
}
```

### Table Customization

```css
.p-datatable .p-datatable-thead > tr > th {
  background: #f8fafc;
  font-weight: 600;
}

.p-datatable .p-datatable-tbody > tr:hover {
  background: #f1f5f9;
}
```

## Pagination Template

The table uses a comprehensive pagination template:

```
FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink 
CurrentPageReport RowsPerPageDropdown
```

Displays:
- Navigation buttons (First, Prev, Next, Last)
- Page numbers
- Current page report ("Showing 1 to 10 of 50 models")
- Rows per page dropdown (10, 25, 50)

## Model Data Structure

Expected model structure:

```typescript
{
  id: string,
  name: string,
  files: [
    {
      id: string,
      originalFileName: string,
      sizeBytes: number,
      isRenderable: boolean,
      ...
    }
  ],
  createdAt: string,
  ...
}
```

## Complete Example

```typescript
import { useState, useEffect, useRef } from 'react'
import { Toast } from 'primereact/toast'
import ModelsDataTable from '../components/model-list/ModelsDataTable'
import { useFileUpload, useDragAndDrop } from '../hooks/useFileUpload'
import { useTabContext } from '../hooks/useTabContext'
import ApiClient from '../services/ApiClient'

function ModelListView() {
  const [models, setModels] = useState([])
  const toast = useRef(null)
  const { openModelDetailsTab } = useTabContext()

  const { uploadMultipleFiles } = useFileUpload({
    requireThreeJSRenderable: false,
    toast,
    onSuccess: () => fetchModels()
  })

  const handleFilesDropped = async (files) => {
    await uploadMultipleFiles(files)
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } = 
    useDragAndDrop(handleFilesDropped)

  const fetchModels = async () => {
    const data = await ApiClient.getModels()
    setModels(data)
  }

  useEffect(() => {
    fetchModels()
  }, [])

  return (
    <>
      <Toast ref={toast} />
      <ModelsDataTable
        models={models}
        onModelSelect={openModelDetailsTab}
        isTabContent={true}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
      />
    </>
  )
}
```

## Related

- [ThumbnailDisplay](./ThumbnailDisplay.md) - Used for thumbnails
- [ModelList](./ModelList.md) - Parent component
- [useFileUpload](../hooks/useFileUpload.md) - Upload functionality
- [fileUtils](../utils/fileUtils.md) - File formatting utilities
