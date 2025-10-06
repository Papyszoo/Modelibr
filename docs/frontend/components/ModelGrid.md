# ModelGrid

Grid layout component for displaying model cards with thumbnails and search functionality.

## Purpose

Provides a modern grid layout for model listing with:
- Responsive grid of thumbnail cards
- Real-time search functionality
- Hover effects showing model names
- Drag and drop file upload support
- Click navigation to model details

## Import

```typescript
import ModelGrid from '../components/model-list/ModelGrid'
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `models` | `Model[]` | Array of models to display |
| `onModelSelect` | `(model: Model) => void` | Callback when model card is clicked |
| `onDrop` | `(e: React.DragEvent) => void` | Drop event handler |
| `onDragOver` | `(e: React.DragEvent) => void` | Drag over handler |
| `onDragEnter` | `(e: React.DragEvent) => void` | Drag enter handler |
| `onDragLeave` | `(e: React.DragEvent) => void` | Drag leave handler |

## Features

### Grid Layout

- **Responsive Design** - Auto-fill grid adapts to screen size (200px minimum card width)
- **Square Cards** - 1:1 aspect ratio thumbnail cards
- **Hover Effects** - Cards elevate and show model name on hover
- **Theme Support** - Works with both light and dark themes

### Search Functionality

- **Real-time Search** - Filters models as you type
- **Case-Insensitive** - Search works regardless of letter case
- **Model Name Matching** - Searches through model file names

### Visual Feedback

- **Hover Overlay** - Dark gradient with model name appears on card hover
- **Card Elevation** - Cards lift slightly on hover for better UX
- **Thumbnail Zoom** - Image scales on hover for visual interest

## Usage Examples

### Basic Usage

```typescript
import ModelGrid from '../components/model-list/ModelGrid'
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
    <ModelGrid
      models={models}
      onModelSelect={handleModelSelect}
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
import ModelGrid from '../components/model-list/ModelGrid'
import { useTabContext } from '../hooks/useTabContext'

function ModelListTab() {
  const [models, setModels] = useState([])
  const { openModelDetailsTab } = useTabContext()

  const handleModelSelect = (model) => {
    // Open in new tab
    openModelDetailsTab(model)
  }

  return (
    <ModelGrid
      models={models}
      onModelSelect={handleModelSelect}
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
import ModelGrid from '../components/model-list/ModelGrid'
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
    <ModelGrid
      models={models}
      onModelSelect={handleModelSelect}
      {...dragHandlers}
    />
  )
}
```

## Component Structure

### Grid Container

```typescript
<div className="model-grid-container">
  <div className="model-grid-controls">
    <div className="search-bar">
      <i className="pi pi-search" />
      <input type="text" placeholder="Search models..." />
    </div>
    <div className="filter-bar">
      <span>Filters (Coming Soon)</span>
    </div>
  </div>
  
  <div className="model-grid">
    {/* Model cards */}
  </div>
</div>
```

### Model Card

```typescript
<div className="model-card" onClick={() => onModelSelect(model)}>
  <div className="model-card-thumbnail">
    <ThumbnailDisplay modelId={model.id} />
    <div className="model-card-overlay">
      <span className="model-card-name">{modelName}</span>
    </div>
  </div>
</div>
```

## Drag and Drop

The grid container supports drag and drop for file uploads:

```typescript
<div
  className="model-grid-container"
  onDrop={onDrop}
  onDragOver={onDragOver}
  onDragEnter={onDragEnter}
  onDragLeave={onDragLeave}
>
  {/* Grid content */}
</div>
```

### Visual Feedback

When files are dragged over the grid:
- Container highlights with blue border
- Background color changes
- Visual indicator shows drop is allowed

## Styling

### Grid Layout

```css
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
}
```

### Model Card

```css
.model-card {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
}

.model-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

### Hover Overlay

```css
.model-card-overlay {
  position: absolute;
  bottom: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.model-card:hover .model-card-overlay {
  opacity: 1;
}
```

## Responsive Breakpoints

- **Desktop** (default): 200px minimum card width
- **Tablet** (max-width: 1200px): 180px minimum card width
- **Mobile** (max-width: 768px): 150px minimum card width
- **Small Mobile** (max-width: 480px): 120px minimum card width

## Search Behavior

The search is:
- **Client-side** - Filters locally without API calls
- **Case-insensitive** - "model" matches "Model", "MODEL", etc.
- **Substring matching** - "drag" matches "dragon.obj"
- **Real-time** - Updates as you type

### Search Implementation

```typescript
const [searchQuery, setSearchQuery] = useState('')

const filteredModels = models.filter(model => {
  const modelName = getModelName(model).toLowerCase()
  return modelName.includes(searchQuery.toLowerCase())
})
```

## Model Name Resolution

The component determines the display name with this priority:
1. First file's `originalFileName` (if files exist)
2. Model's `name` property
3. Fallback: `"Model {id}"`

```typescript
const getModelName = (model: Model) => {
  return model.files && model.files.length > 0
    ? model.files[0].originalFileName
    : model.name || `Model ${model.id}`
}
```

## Complete Example

```typescript
import { useState, useEffect, useRef } from 'react'
import { Toast } from 'primereact/toast'
import ModelGrid from '../components/model-list/ModelGrid'
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
      <ModelGrid
        models={models}
        onModelSelect={openModelDetailsTab}
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

- [ThumbnailDisplay](./ThumbnailDisplay.md) - Used for card thumbnails
- [ModelList](./ModelList.md) - Parent component
- [useFileUpload](../hooks/useFileUpload.md) - Upload functionality
- [fileUtils](../utils/fileUtils.md) - File formatting utilities
