# useTexturePacks

Custom hook for managing texture pack CRUD operations.

## Purpose

Provides comprehensive texture pack management:
- Fetch all texture packs
- Get individual texture pack details
- Create new texture packs
- Update existing texture packs
- Delete texture packs
- Add textures to packs
- Remove textures from packs
- Associate/disassociate packs with models
- Fetch models list

## Import

```typescript
import { useTexturePacks } from '../hooks/useTexturePacks'
```

## API

### useTexturePacks()

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `loading` | `boolean` | Whether any operation is in progress |
| `error` | `string \| null` | Error message from last operation |
| `getAllTexturePacks` | `() => Promise<TexturePackDto[]>` | Fetch all texture packs |
| `getTexturePackById` | `(id: number) => Promise<TexturePackDto>` | Fetch specific pack |
| `createTexturePack` | `(request) => Promise<CreateTexturePackResponse>` | Create new pack |
| `updateTexturePack` | `(id, request) => Promise<UpdateTexturePackResponse>` | Update pack |
| `deleteTexturePack` | `(id: number) => Promise<void>` | Delete pack |
| `addTextureToPackEndpoint` | `(packId, request) => Promise<AddTextureToPackResponse>` | Add texture |
| `removeTextureFromPack` | `(packId, textureId) => Promise<void>` | Remove texture |
| `associateTexturePackWithModel` | `(packId, modelId) => Promise<void>` | Associate with model |
| `disassociateTexturePackFromModel` | `(packId, modelId) => Promise<void>` | Disassociate from model |
| `getModels` | `() => Promise<Model[]>` | Fetch all models |

## Types

### TexturePackDto

```typescript
{
  id: number,
  name: string,
  createdAt: string,
  updatedAt: string,
  textureCount: number,
  isEmpty: boolean,
  textures: TextureDto[],
  associatedModels: ModelSummaryDto[]
}
```

### CreateTexturePackRequest

```typescript
{
  name: string
}
```

### AddTextureToPackRequest

```typescript
{
  fileId: number,
  textureType: TextureType
}
```

## Usage Examples

### Fetching Texture Packs

```typescript
import { useTexturePacks } from '../hooks/useTexturePacks'

function TexturePackList() {
  const { getAllTexturePacks, loading, error } = useTexturePacks()
  const [packs, setPacks] = useState([])

  useEffect(() => {
    const fetchPacks = async () => {
      try {
        const data = await getAllTexturePacks()
        setPacks(data)
      } catch (err) {
        console.error('Failed to load packs:', err)
      }
    }
    fetchPacks()
  }, [getAllTexturePacks])

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <ul>
      {packs.map(pack => (
        <li key={pack.id}>
          {pack.name} ({pack.textureCount} textures)
        </li>
      ))}
    </ul>
  )
}
```

### Creating a Texture Pack

```typescript
import { useState } from 'react'
import { useTexturePacks } from '../hooks/useTexturePacks'

function CreateTexturePackDialog() {
  const [name, setName] = useState('')
  const { createTexturePack, loading, error } = useTexturePacks()

  const handleCreate = async () => {
    try {
      const result = await createTexturePack({ name })
      console.log('Created pack:', result)
      // Close dialog, refresh list, etc.
    } catch (err) {
      console.error('Failed to create:', err)
    }
  }

  return (
    <div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pack name"
      />
      <button onClick={handleCreate} disabled={loading || !name}>
        Create Pack
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  )
}
```

### Adding Texture to Pack

```typescript
import { useTexturePacks } from '../hooks/useTexturePacks'
import { TextureType } from '../types'

function AddTextureButton({ packId, fileId }) {
  const { addTextureToPackEndpoint, loading } = useTexturePacks()

  const handleAddTexture = async () => {
    try {
      await addTextureToPackEndpoint(packId, {
        fileId: fileId,
        textureType: TextureType.Albedo
      })
      console.log('Texture added successfully')
    } catch (err) {
      console.error('Failed to add texture:', err)
    }
  }

  return (
    <button onClick={handleAddTexture} disabled={loading}>
      Add as Albedo Texture
    </button>
  )
}
```

### Managing Pack Details

```typescript
import { useEffect, useState } from 'react'
import { useTexturePacks } from '../hooks/useTexturePacks'

function TexturePackDetails({ packId }) {
  const [pack, setPack] = useState(null)
  const {
    getTexturePackById,
    updateTexturePack,
    deleteTexturePack,
    removeTextureFromPack,
    loading,
    error
  } = useTexturePacks()

  useEffect(() => {
    const fetchPack = async () => {
      const data = await getTexturePackById(packId)
      setPack(data)
    }
    fetchPack()
  }, [packId, getTexturePackById])

  const handleRename = async (newName) => {
    try {
      await updateTexturePack(packId, { name: newName })
      setPack({ ...pack, name: newName })
    } catch (err) {
      console.error('Failed to rename:', err)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteTexturePack(packId)
      // Navigate away or close dialog
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const handleRemoveTexture = async (textureId) => {
    try {
      await removeTextureFromPack(packId, textureId)
      // Refresh pack data
      const updated = await getTexturePackById(packId)
      setPack(updated)
    } catch (err) {
      console.error('Failed to remove texture:', err)
    }
  }

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  if (!pack) return null

  return (
    <div>
      <h2>{pack.name}</h2>
      <button onClick={() => handleRename(prompt('New name:'))}>
        Rename
      </button>
      <button onClick={handleDelete}>Delete Pack</button>
      
      <h3>Textures ({pack.textureCount})</h3>
      <ul>
        {pack.textures.map(texture => (
          <li key={texture.id}>
            {texture.fileName}
            <button onClick={() => handleRemoveTexture(texture.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Model Association

```typescript
import { useTexturePacks } from '../hooks/useTexturePacks'

function ModelAssociation({ packId, modelId, isAssociated }) {
  const {
    associateTexturePackWithModel,
    disassociateTexturePackFromModel,
    loading
  } = useTexturePacks()

  const handleToggle = async () => {
    try {
      if (isAssociated) {
        await disassociateTexturePackFromModel(packId, modelId)
        console.log('Disassociated')
      } else {
        await associateTexturePackWithModel(packId, modelId)
        console.log('Associated')
      }
    } catch (err) {
      console.error('Association failed:', err)
    }
  }

  return (
    <button onClick={handleToggle} disabled={loading}>
      {isAssociated ? 'Disassociate' : 'Associate'}
    </button>
  )
}
```

### Full Pack Management Example

```typescript
import { useState, useEffect } from 'react'
import { useTexturePacks } from '../hooks/useTexturePacks'

function TexturePackManager() {
  const [packs, setPacks] = useState([])
  const [models, setModels] = useState([])
  const {
    getAllTexturePacks,
    getModels,
    createTexturePack,
    deleteTexturePack,
    loading,
    error
  } = useTexturePacks()

  useEffect(() => {
    const loadData = async () => {
      const [packsData, modelsData] = await Promise.all([
        getAllTexturePacks(),
        getModels()
      ])
      setPacks(packsData)
      setModels(modelsData)
    }
    loadData()
  }, [getAllTexturePacks, getModels])

  const handleCreate = async (name) => {
    const result = await createTexturePack({ name })
    const updated = await getAllTexturePacks()
    setPacks(updated)
  }

  const handleDelete = async (id) => {
    await deleteTexturePack(id)
    const updated = await getAllTexturePacks()
    setPacks(updated)
  }

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <h2>Texture Packs ({packs.length})</h2>
      <button onClick={() => handleCreate(prompt('Pack name:'))}>
        New Pack
      </button>
      
      <ul>
        {packs.map(pack => (
          <li key={pack.id}>
            {pack.name} - {pack.textureCount} textures
            <button onClick={() => handleDelete(pack.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      <h2>Models ({models.length})</h2>
      <ul>
        {models.map(model => (
          <li key={model.id}>{model.name}</li>
        ))}
      </ul>
    </div>
  )
}
```

## Error Handling

All functions handle errors and update the `error` state:

```typescript
const { getAllTexturePacks, error } = useTexturePacks()

try {
  await getAllTexturePacks()
} catch (err) {
  // Error is already captured in the error state
  console.log(error) // "Failed to load texture packs"
}
```

## Loading State

The `loading` state is automatically managed:

```typescript
const { createTexturePack, loading } = useTexturePacks()

// Before: loading = false
await createTexturePack({ name: 'New Pack' })
// During: loading = true
// After: loading = false
```

## Related

- [TexturePackList](../components/TexturePackList.md) - Main list component
- [CreateTexturePackDialog](../components/CreateTexturePackDialog.md) - Creation dialog
- [TexturePackDetailDialog](../components/TexturePackDetailDialog.md) - Details dialog
- [ApiClient](../services/ApiClient.md) - API service used by this hook
