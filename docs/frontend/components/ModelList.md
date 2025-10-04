# ModelList

Main component for displaying and managing the model list with upload functionality.

## Purpose

Provides comprehensive model management:
- Model list display with data table
- File upload via button or drag-and-drop
- Upload progress tracking
- Error and loading states
- Empty state with upload zone
- Tab context integration

## Import

```typescript
import ModelList from '../ModelList'
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `onBackToUpload` | `() => void` | Optional callback for back navigation |
| `isTabContent` | `boolean` | Whether component is in a tab context |

## Features

### File Upload
- Button-based file selection
- Drag-and-drop upload
- Multi-file support
- Progress tracking
- Toast notifications

### State Management
- Loading state
- Error state with retry
- Empty state with upload zone
- Populated state with data table

### Tab Integration
- Opens model details in new tab
- Inherits tab context from parent

## Usage Examples

### Basic Usage

```typescript
import ModelList from '../ModelList'

function App() {
  return (
    <div className="app">
      <ModelList />
    </div>
  )
}
```

### With Back Navigation

```typescript
import { useState } from 'react'
import ModelList from '../ModelList'
import UploadPage from './UploadPage'

function App() {
  const [view, setView] = useState('upload')

  if (view === 'list') {
    return (
      <ModelList onBackToUpload={() => setView('upload')} />
    )
  }

  return <UploadPage onGoToList={() => setView('list')} />
}
```

### As Tab Content

```typescript
import ModelList from '../ModelList'
import { TabProvider } from '../hooks/useTabContext'

function ModelListTab({ tabs, setTabs, activeTab, setActiveTab }) {
  return (
    <TabProvider
      side="left"
      tabs={tabs}
      setTabs={setTabs}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      <ModelList isTabContent={true} />
    </TabProvider>
  )
}
```

## Component Structure

### ModelList (Wrapper)
Main export that handles tab context integration:

```typescript
function ModelList({ onBackToUpload, isTabContent = false }) {
  const tabContext = useTabContext()
  
  return (
    <ModelListContent
      onBackToUpload={onBackToUpload}
      tabContext={tabContext}
      isTabContent={isTabContent}
    />
  )
}
```

### ModelListWithTabContext
Provides tab context when not in a tab:

```typescript
function ModelListWithTabContext({ onBackToUpload }) {
  const [tabs, setTabs] = useState([])
  const [activeTab, setActiveTab] = useState('')

  return (
    <TabProvider {...tabState}>
      <ModelList onBackToUpload={onBackToUpload} />
    </TabProvider>
  )
}
```

### ModelListContent
Core component with all functionality:

```typescript
function ModelListContent({ onBackToUpload, tabContext, isTabContent }) {
  // State management
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Upload handling
  // Model fetching
  // UI rendering
}
```

## State Flow

```
Initial Load
    ↓
Loading State (spinner)
    ↓
Fetch Models
    ↓
┌─────────────┬──────────────┬─────────────┐
│ Error State │ Empty State  │ Data Table  │
│ (with retry)│ (with upload)│ (with data) │
└─────────────┴──────────────┴─────────────┘
```

## Upload Flow

```
File Selection/Drop
    ↓
Validate Files
    ↓
Upload Progress (0-100%)
    ↓
┌──────────┬─────────────┐
│ Success  │ Error       │
│ (refresh)│ (show toast)│
└──────────┴─────────────┘
    ↓
Fetch Updated Models
```

## Sub-Components

### ModelListHeader
```typescript
<ModelListHeader
  isTabContent={isTabContent}
  onBackToUpload={onBackToUpload}
  modelCount={models.length}
/>
```

### UploadProgress
```typescript
<UploadProgress 
  visible={uploading} 
  progress={uploadProgress} 
/>
```

### LoadingState
```typescript
<LoadingState visible={loading} />
```

### ErrorState
```typescript
<ErrorState
  visible={!!error && !loading}
  error={error}
  onRetry={fetchModels}
/>
```

### EmptyState
```typescript
<EmptyState
  visible={!loading && !error && models.length === 0}
  onDrop={onDrop}
  onDragOver={onDragOver}
  onDragEnter={onDragEnter}
  onDragLeave={onDragLeave}
/>
```

### ModelsDataTable
```typescript
<ModelsDataTable
  models={models}
  onModelSelect={handleModelSelect}
  isTabContent={isTabContent}
  onDrop={onDrop}
  onDragOver={onDragOver}
  onDragEnter={onDragEnter}
  onDragLeave={onDragLeave}
/>
```

## Model Selection

Handles model selection differently based on context:

### In Tab Context
```typescript
if (isTabContent && tabContext) {
  tabContext.openModelDetailsTab(model)
}
```

### Standalone
```typescript
else {
  // Navigate to model viewer or other action
}
```

## File Upload Integration

Uses `useFileUpload` and `useDragAndDrop` hooks:

```typescript
const toast = useRef(null)

const { uploadMultipleFiles, uploading, uploadProgress } = useFileUpload({
  requireThreeJSRenderable: false,
  toast,
  onSuccess: () => fetchModels()
})

const { onDrop, onDragOver, onDragEnter, onDragLeave } = 
  useDragAndDrop(async (files) => {
    await uploadMultipleFiles(files)
  })
```

## CSS Classes

| Class | Description |
|-------|-------------|
| `model-list` | Container element |
| `model-list-tab` | Applied when `isTabContent` is true |

## Complete Example

```typescript
import { useState, useEffect, useRef } from 'react'
import { Toast } from 'primereact/toast'
import ModelList from '../ModelList'
import { TabProvider } from '../hooks/useTabContext'

function ModelManagementView() {
  const [showUpload, setShowUpload] = useState(false)
  const [tabs, setTabs] = useState([
    { id: 'models', type: 'modelList', label: 'Models' }
  ])
  const [activeTab, setActiveTab] = useState('models')

  return (
    <div className="model-management">
      <header>
        <h1>Model Library</h1>
        <button onClick={() => setShowUpload(!showUpload)}>
          {showUpload ? 'View List' : 'Upload Models'}
        </button>
      </header>

      {showUpload ? (
        <UploadPage onComplete={() => setShowUpload(false)} />
      ) : (
        <TabProvider
          side="left"
          tabs={tabs}
          setTabs={setTabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        >
          <ModelList 
            onBackToUpload={() => setShowUpload(true)}
            isTabContent={true}
          />
        </TabProvider>
      )}
    </div>
  )
}
```

## Toast Notifications

The component uses PrimeReact Toast for notifications:

```typescript
<Toast ref={toast} />

// Success
toast.current.show({
  severity: 'success',
  summary: 'Upload Successful',
  detail: `${file.name} uploaded successfully`
})

// Error
toast.current.show({
  severity: 'error',
  summary: 'Upload Failed',
  detail: error.message
})
```

## Data Fetching

```typescript
const fetchModels = async () => {
  try {
    setLoading(true)
    setError(null)
    const data = await ApiClient.getModels()
    setModels(data)
  } catch (err) {
    setError(err.message || 'Failed to load models')
  } finally {
    setLoading(false)
  }
}

useEffect(() => {
  fetchModels()
}, [])
```

## Related

- [ModelsDataTable](./ModelsDataTable.md) - Data table component
- [ModelListHeader](./ModelListHeader.md) - Header component
- [EmptyState](./EmptyState.md) - Empty state
- [LoadingState](./LoadingState.md) - Loading indicator
- [ErrorState](./ErrorState.md) - Error display
- [UploadProgress](./UploadProgress.md) - Progress indicator
- [useFileUpload](../hooks/useFileUpload.md) - Upload hook
- [useTabContext](../hooks/useTabContext.md) - Tab context
