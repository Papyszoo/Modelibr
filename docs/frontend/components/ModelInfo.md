# ModelInfo

Component for displaying model metadata and 3D viewer information.

## Purpose

Displays comprehensive model information:
- Model metadata (ID, dates, format)
- TSL rendering features
- Viewer controls guide
- Formatted dates and file info

## Import

```typescript
import ModelInfo from '../components/ModelInfo'
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `model` | `Model` | Model object with metadata |

## Usage Examples

### Basic Usage

```typescript
import ModelInfo from '../components/ModelInfo'

function ModelSidebar({ model }) {
  return (
    <div className="sidebar">
      <ModelInfo model={model} />
    </div>
  )
}
```

### With Model Viewer

```typescript
import ModelInfo from '../components/ModelInfo'
import ModelViewer from '../components/ModelViewer'

function ModelDetailsPage({ model }) {
  return (
    <div className="model-details">
      <div className="viewer">
        <ModelViewer model={model} />
      </div>
      <div className="info">
        <ModelInfo model={model} />
      </div>
    </div>
  )
}
```

## Information Sections

### 1. Model Information

Displays basic metadata:

```typescript
<div className="info-section">
  <h3>Model Information</h3>
  <div className="info-grid">
    <div className="info-item">
      <label>ID:</label>
      <span>{model.id}</span>
    </div>
    <div className="info-item">
      <label>Created:</label>
      <span>{new Date(model.createdAt).toLocaleString()}</span>
    </div>
    <div className="info-item">
      <label>Modified:</label>
      <span>{new Date(model.updatedAt).toLocaleString()}</span>
    </div>
    <div className="info-item">
      <label>Format:</label>
      <span>{getModelFileFormat(model)}</span>
    </div>
  </div>
</div>
```

### 2. TSL Rendering Features

Lists supported rendering features:

```typescript
<div className="info-section">
  <h3>TSL Rendering Features</h3>
  <ul className="feature-list">
    <li>✓ Real-time physically based rendering (PBR)</li>
    <li>✓ Dynamic lighting with shadow mapping</li>
    <li>✓ Material metalness and roughness controls</li>
    <li>✓ Environment mapping for reflections</li>
    <li>✓ Interactive orbit controls</li>
  </ul>
</div>
```

### 3. Controls Guide

Explains viewer controls:

```typescript
<div className="info-section">
  <h3>Controls</h3>
  <ul className="controls-list">
    <li>
      <strong>Mouse:</strong> Rotate view
    </li>
    <li>
      <strong>Scroll:</strong> Zoom in/out
    </li>
    <li>
      <strong>Right-click + drag:</strong> Pan view
    </li>
  </ul>
</div>
```

## Data Formatting

### Date Formatting

Uses `toLocaleString()` for user's locale:

```typescript
new Date(model.createdAt).toLocaleString()
// "12/25/2023, 3:45:30 PM" (US)
// "25/12/2023 15:45:30" (EU)
```

### Format Detection

Uses `getModelFileFormat` utility:

```typescript
import { getModelFileFormat } from '../utils/fileUtils'

const format = getModelFileFormat(model)
// "OBJ", "GLTF", "GLB", etc.
```

## CSS Classes

| Class | Description |
|-------|-------------|
| `info-section` | Section container |
| `info-grid` | Grid layout for metadata |
| `info-item` | Individual metadata item |
| `feature-list` | Features list |
| `controls-list` | Controls list |

## Styling Example

```css
.info-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 8px;
}

.info-section h3 {
  margin-bottom: 1rem;
  color: #1e293b;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
}

.info-item label {
  font-weight: 600;
  color: #64748b;
  font-size: 0.875rem;
}

.info-item span {
  color: #1e293b;
  font-size: 1rem;
}

.feature-list,
.controls-list {
  list-style: none;
  padding: 0;
}

.feature-list li,
.controls-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #e2e8f0;
}

.feature-list li:last-child,
.controls-list li:last-child {
  border-bottom: none;
}
```

## Complete Example

```typescript
import ModelInfo from '../components/ModelInfo'
import { useEffect, useState } from 'react'
import ApiClient from '../services/ApiClient'

function ModelDetailsView({ modelId }) {
  const [model, setModel] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchModel = async () => {
      try {
        const data = await ApiClient.getModelById(modelId)
        setModel(data)
      } catch (error) {
        console.error('Failed to load model:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchModel()
  }, [modelId])

  if (loading) return <div>Loading...</div>
  if (!model) return <div>Model not found</div>

  return (
    <div className="model-details-view">
      <header>
        <h1>{model.name || `Model #${model.id}`}</h1>
      </header>
      
      <main className="content">
        <div className="viewer-container">
          <ModelViewer model={model} />
        </div>
        
        <aside className="info-sidebar">
          <ModelInfo model={model} />
        </aside>
      </main>
    </div>
  )
}
```

## Model Object Structure

Expected model structure:

```typescript
{
  id: string,
  name?: string,
  description?: string,
  files: ModelFile[],
  createdAt: string,     // ISO 8601 date
  updatedAt: string      // ISO 8601 date
}
```

## Related

- [ModelInfoSidebar](./ModelInfoSidebar.md) - Sidebar wrapper
- [ModelViewer](./ModelViewer.md) - 3D viewer component
- [getModelFileFormat](../utils/fileUtils.md#getmodelfileformat) - Format utility
- [Model Types](../utils/fileUtils.md#model) - Model interface
