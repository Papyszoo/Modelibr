# textureTypeUtils

Utilities for texture type metadata, labels, colors, and icons.

## Purpose

Provides comprehensive texture type management:
- Human-readable labels
- Visual indicators (colors and icons)
- Type metadata and descriptions
- Dropdown options generation

## Import

```typescript
import {
  TEXTURE_TYPE_INFO,
  getTextureTypeInfo,
  getTextureTypeLabel,
  getTextureTypeColor,
  getTextureTypeIcon,
  getAllTextureTypes,
  getTextureTypeOptions,
  type TextureTypeInfo
} from '../utils/textureTypeUtils'
```

## Types

### TextureType Enum

```typescript
enum TextureType {
  Albedo = 1,
  Normal = 2,
  Height = 3,
  AO = 4,
  Roughness = 5,
  Metallic = 6,
  Diffuse = 7,
  Specular = 8,
}
```

### TextureTypeInfo

```typescript
interface TextureTypeInfo {
  label: string        // Display name
  description: string  // Full description
  color: string       // Hex color code
  icon: string        // PrimeIcons icon class
}
```

## Constants

### TEXTURE_TYPE_INFO

Complete metadata for all texture types:

```typescript
{
  [TextureType.Albedo]: {
    label: 'Albedo',
    description: 'Base color or diffuse map - the main surface color',
    color: '#3b82f6',  // Blue
    icon: 'pi-palette',
  },
  [TextureType.Normal]: {
    label: 'Normal',
    description: 'Normal map - surface detail through normals',
    color: '#10b981',  // Green
    icon: 'pi-map',
  },
  [TextureType.Height]: {
    label: 'Height',
    description: 'Height or displacement map - surface geometry variation',
    color: '#8b5cf6',  // Purple
    icon: 'pi-chart-line',
  },
  [TextureType.AO]: {
    label: 'AO',
    description: 'Ambient Occlusion map - shadow detail in surface crevices',
    color: '#374151',  // Dark gray
    icon: 'pi-eye-slash',
  },
  [TextureType.Roughness]: {
    label: 'Roughness',
    description: 'Roughness map - surface micro-detail affecting reflections',
    color: '#f59e0b',  // Orange/yellow
    icon: 'pi-circle',
  },
  [TextureType.Metallic]: {
    label: 'Metallic',
    description: 'Metallic map - defines metallic vs non-metallic areas',
    color: '#6b7280',  // Silver/gray
    icon: 'pi-star-fill',
  },
  [TextureType.Diffuse]: {
    label: 'Diffuse',
    description: 'Diffuse map - traditional diffuse color (legacy name for Albedo)',
    color: '#ef4444',  // Red
    icon: 'pi-sun',
  },
  [TextureType.Specular]: {
    label: 'Specular',
    description: 'Specular map - reflectivity and highlight intensity',
    color: '#06b6d4',  // Cyan
    icon: 'pi-sparkles',
  },
}
```

## Functions

### getTextureTypeInfo

Get complete metadata for a texture type.

#### Signature

```typescript
function getTextureTypeInfo(textureType: TextureType): TextureTypeInfo
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `textureType` | `TextureType` | Texture type enum value |

#### Returns

`TextureTypeInfo` - Complete metadata object

#### Example

```typescript
const info = getTextureTypeInfo(TextureType.Albedo)
// {
//   label: 'Albedo',
//   description: 'Base color or diffuse map - the main surface color',
//   color: '#3b82f6',
//   icon: 'pi-palette'
// }
```

### getTextureTypeLabel

Get human-readable label for a texture type.

#### Signature

```typescript
function getTextureTypeLabel(textureType: TextureType): string
```

#### Examples

```typescript
getTextureTypeLabel(TextureType.Albedo)     // 'Albedo'
getTextureTypeLabel(TextureType.Normal)     // 'Normal'
getTextureTypeLabel(TextureType.AO)         // 'AO'
getTextureTypeLabel(999)                    // 'Unknown'
```

### getTextureTypeColor

Get color code for a texture type.

#### Signature

```typescript
function getTextureTypeColor(textureType: TextureType): string
```

#### Examples

```typescript
getTextureTypeColor(TextureType.Albedo)     // '#3b82f6' (blue)
getTextureTypeColor(TextureType.Normal)     // '#10b981' (green)
getTextureTypeColor(TextureType.Roughness)  // '#f59e0b' (orange)
getTextureTypeColor(999)                    // '#6b7280' (gray fallback)
```

### getTextureTypeIcon

Get PrimeIcons icon class for a texture type.

#### Signature

```typescript
function getTextureTypeIcon(textureType: TextureType): string
```

#### Examples

```typescript
getTextureTypeIcon(TextureType.Albedo)      // 'pi-palette'
getTextureTypeIcon(TextureType.Normal)      // 'pi-map'
getTextureTypeIcon(TextureType.Metallic)    // 'pi-star-fill'
getTextureTypeIcon(999)                     // 'pi-image' (fallback)
```

### getAllTextureTypes

Get array of all texture type enum values.

#### Signature

```typescript
function getAllTextureTypes(): TextureType[]
```

#### Returns

`TextureType[]` - Array of enum values [1, 2, 3, 4, 5, 6, 7, 8]

#### Example

```typescript
const types = getAllTextureTypes()
// [1, 2, 3, 4, 5, 6, 7, 8]
// (Albedo, Normal, Height, AO, Roughness, Metallic, Diffuse, Specular)
```

### getTextureTypeOptions

Get dropdown-ready options with labels, values, colors, and icons.

#### Signature

```typescript
function getTextureTypeOptions(): Array<{
  label: string
  value: TextureType
  color: string
  icon: string
}>
```

#### Returns

Array of option objects for use in dropdowns/selects.

#### Example

```typescript
const options = getTextureTypeOptions()
// [
//   { label: 'Albedo', value: 1, color: '#3b82f6', icon: 'pi-palette' },
//   { label: 'Normal', value: 2, color: '#10b981', icon: 'pi-map' },
//   ...
// ]
```

## Usage Examples

### Texture Type Badge

```typescript
import { getTextureTypeLabel, getTextureTypeColor, getTextureTypeIcon } from '../utils/textureTypeUtils'
import { TextureType } from '../types'

function TextureTypeBadge({ type }: { type: TextureType }) {
  const label = getTextureTypeLabel(type)
  const color = getTextureTypeColor(type)
  const icon = getTextureTypeIcon(type)

  return (
    <span
      className="texture-type-badge"
      style={{ 
        backgroundColor: color,
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px'
      }}
    >
      <i className={`pi ${icon}`} /> {label}
    </span>
  )
}
```

### Dropdown with Icons

```typescript
import { Dropdown } from 'primereact/dropdown'
import { getTextureTypeOptions } from '../utils/textureTypeUtils'

function TextureTypeSelector({ value, onChange }) {
  const options = getTextureTypeOptions()

  const itemTemplate = (option) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <i 
        className={`pi ${option.icon}`}
        style={{ color: option.color }}
      />
      <span>{option.label}</span>
    </div>
  )

  return (
    <Dropdown
      value={value}
      options={options}
      onChange={(e) => onChange(e.value)}
      itemTemplate={itemTemplate}
      placeholder="Select texture type"
    />
  )
}
```

### Texture List with Metadata

```typescript
import { getTextureTypeInfo } from '../utils/textureTypeUtils'
import { TextureType } from '../types'

function TextureList({ textures }) {
  return (
    <ul>
      {textures.map(texture => {
        const info = getTextureTypeInfo(texture.textureType)
        
        return (
          <li key={texture.id}>
            <div>
              <i 
                className={`pi ${info.icon}`}
                style={{ color: info.color }}
              />
              <strong>{info.label}</strong>
            </div>
            <p>{info.description}</p>
            <small>{texture.fileName}</small>
          </li>
        )
      })}
    </ul>
  )
}
```

### Color-Coded Table

```typescript
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { getTextureTypeLabel, getTextureTypeColor } from '../utils/textureTypeUtils'

function TexturesTable({ textures }) {
  const typeBodyTemplate = (rowData) => {
    const label = getTextureTypeLabel(rowData.textureType)
    const color = getTextureTypeColor(rowData.textureType)

    return (
      <span style={{ color }}>
        ● {label}
      </span>
    )
  }

  return (
    <DataTable value={textures}>
      <Column field="fileName" header="File" />
      <Column 
        field="textureType" 
        header="Type" 
        body={typeBodyTemplate}
      />
    </DataTable>
  )
}
```

### Texture Type Filter

```typescript
import { MultiSelect } from 'primereact/multiselect'
import { getTextureTypeOptions } from '../utils/textureTypeUtils'

function TextureTypeFilter({ selectedTypes, onChange }) {
  const options = getTextureTypeOptions()

  return (
    <MultiSelect
      value={selectedTypes}
      options={options}
      onChange={(e) => onChange(e.value)}
      placeholder="Filter by type"
      display="chip"
    />
  )
}
```

### Texture Pack Summary

```typescript
import { getAllTextureTypes, getTextureTypeLabel } from '../utils/textureTypeUtils'

function TexturePackSummary({ pack }) {
  const allTypes = getAllTextureTypes()
  
  const typeCounts = allTypes.map(type => ({
    type,
    label: getTextureTypeLabel(type),
    count: pack.textures.filter(t => t.textureType === type).length
  }))

  return (
    <div className="texture-pack-summary">
      <h3>{pack.name}</h3>
      <ul>
        {typeCounts.map(({ type, label, count }) => (
          <li key={type}>
            {label}: {count}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Legend Component

```typescript
import { getAllTextureTypes, getTextureTypeInfo } from '../utils/textureTypeUtils'

function TextureTypeLegend() {
  const types = getAllTextureTypes()

  return (
    <div className="texture-type-legend">
      <h4>Texture Types</h4>
      {types.map(type => {
        const info = getTextureTypeInfo(type)
        return (
          <div key={type} className="legend-item">
            <span 
              className="color-indicator"
              style={{ backgroundColor: info.color }}
            />
            <div>
              <strong>{info.label}</strong>
              <p>{info.description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

## Color Palette

| Type | Color | Hex Code | Visual |
|------|-------|----------|--------|
| Albedo | Blue | `#3b82f6` | 🔵 |
| Normal | Green | `#10b981` | 🟢 |
| Height | Purple | `#8b5cf6` | 🟣 |
| AO | Dark Gray | `#374151` | ⚫ |
| Roughness | Orange | `#f59e0b` | 🟠 |
| Metallic | Silver | `#6b7280` | ⚪ |
| Diffuse | Red | `#ef4444` | 🔴 |
| Specular | Cyan | `#06b6d4` | 🔷 |

## Icon Reference

| Type | Icon Class | Icon |
|------|-----------|------|
| Albedo | `pi-palette` | 🎨 |
| Normal | `pi-map` | 🗺️ |
| Height | `pi-chart-line` | 📈 |
| AO | `pi-eye-slash` | 👁️ |
| Roughness | `pi-circle` | ⭕ |
| Metallic | `pi-star-fill` | ⭐ |
| Diffuse | `pi-sun` | ☀️ |
| Specular | `pi-sparkles` | ✨ |

## Related

- [TexturePackList](../components/TexturePackList.md) - Uses texture type utilities
- [AddTextureToPackDialog](../components/AddTextureToPackDialog.md) - Uses dropdown options
- [TexturePackDetailDialog](../components/TexturePackDetailDialog.md) - Uses badges and colors
- [useTexturePacks](../hooks/useTexturePacks.md) - Texture pack management
