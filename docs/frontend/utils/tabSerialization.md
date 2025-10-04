# tabSerialization

Utilities for serializing and deserializing tab state to/from URL query parameters.

## Purpose

Provides URL persistence for tabs with:
- Compact URL format
- Backward compatibility with JSON format
- Tab label generation
- Type-safe parsing

## Import

```typescript
import {
  getTabLabel,
  parseCompactTabFormat,
  serializeToCompactFormat
} from '../utils/tabSerialization'
```

## Functions

### getTabLabel

Generate display label for a tab based on its type.

#### Signature

```typescript
function getTabLabel(type: Tab['type'], modelId?: string): string
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `'modelList' \| 'modelViewer' \| 'texture' \| 'animation' \| 'texturePacks'` | Tab type |
| `modelId` | `string?` | Optional model ID for viewer tabs |

#### Returns

`string` - Human-readable label

#### Examples

```typescript
getTabLabel('modelList')              // 'Models'
getTabLabel('texture')                // 'Textures'
getTabLabel('animation')              // 'Animations'
getTabLabel('modelViewer', '123')     // 'Model 123'
getTabLabel('modelViewer')            // 'Model Viewer'
getTabLabel('texturePacks')           // 'Unknown'
```

### parseCompactTabFormat

Parse URL-encoded tab string to tab array.

#### Signature

```typescript
function parseCompactTabFormat(
  value: string,
  defaultValue: Tab[] = []
): Tab[]
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | `string` | URL-encoded tab string |
| `defaultValue` | `Tab[]` | Fallback value if parsing fails |

#### Returns

`Tab[]` - Array of parsed tabs

#### Format

```
type[:modelId][,type[:modelId]...]
```

#### Examples

```typescript
// Single tab
parseCompactTabFormat('modelList')
// [{ id: 'modelList', type: 'modelList', label: 'Models' }]

// Multiple tabs
parseCompactTabFormat('modelList,texture')
// [
//   { id: 'modelList', type: 'modelList', label: 'Models' },
//   { id: 'texture', type: 'texture', label: 'Textures' }
// ]

// Model viewer tab
parseCompactTabFormat('modelViewer:123')
// [{ 
//   id: 'model-123', 
//   type: 'modelViewer', 
//   label: 'Model 123',
//   modelId: '123' 
// }]

// Mixed tabs
parseCompactTabFormat('modelList,modelViewer:5,texture')
// [
//   { id: 'modelList', type: 'modelList', label: 'Models' },
//   { id: 'model-5', type: 'modelViewer', label: 'Model 5', modelId: '5' },
//   { id: 'texture', type: 'texture', label: 'Textures' }
// ]

// Invalid format
parseCompactTabFormat('invalid', [{ id: 'default', type: 'modelList' }])
// [{ id: 'default', type: 'modelList' }] (returns default)

// Legacy JSON format (backward compatibility)
parseCompactTabFormat('[{"id":"models","type":"modelList"}]')
// [{ id: 'models', type: 'modelList' }]
```

### serializeToCompactFormat

Serialize tab array to compact URL format.

#### Signature

```typescript
function serializeToCompactFormat(tabs: Tab[]): string
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `tabs` | `Tab[]` | Array of tabs to serialize |

#### Returns

`string` - Compact URL-encoded string

#### Examples

```typescript
// Single tab
serializeToCompactFormat([
  { id: 'modelList', type: 'modelList' }
])
// 'modelList'

// Multiple tabs
serializeToCompactFormat([
  { id: 'modelList', type: 'modelList' },
  { id: 'texture', type: 'texture' }
])
// 'modelList,texture'

// Model viewer tab
serializeToCompactFormat([
  { id: 'model-123', type: 'modelViewer', modelId: '123' }
])
// 'modelViewer:123'

// Mixed tabs
serializeToCompactFormat([
  { id: 'modelList', type: 'modelList' },
  { id: 'model-5', type: 'modelViewer', modelId: '5' },
  { id: 'texture', type: 'texture' }
])
// 'modelList,modelViewer:5,texture'

// Empty array
serializeToCompactFormat([])
// ''
```

## Usage Examples

### With URL State Hook

```typescript
import { useQueryState } from 'nuqs'
import { parseCompactTabFormat, serializeToCompactFormat } from '../utils/tabSerialization'

function TabPanel() {
  const [tabs, setTabs] = useQueryState('tabs', {
    defaultValue: [{ id: 'models', type: 'modelList' }],
    parse: (value) => parseCompactTabFormat(value, [{ id: 'models', type: 'modelList' }]),
    serialize: serializeToCompactFormat,
  })

  // tabs are automatically synced with URL
  // ?tabs=modelList,texture
}
```

### Building Tab from URL

```typescript
import { parseCompactTabFormat } from '../utils/tabSerialization'

function TabsFromURL() {
  const params = new URLSearchParams(window.location.search)
  const tabString = params.get('tabs') || ''
  
  const tabs = parseCompactTabFormat(tabString, [
    { id: 'models', type: 'modelList', label: 'Models' }
  ])

  return (
    <div>
      {tabs.map(tab => (
        <div key={tab.id}>{tab.label}</div>
      ))}
    </div>
  )
}
```

### Generating Shareable Links

```typescript
import { serializeToCompactFormat } from '../utils/tabSerialization'

function ShareButton({ tabs }) {
  const generateShareLink = () => {
    const base = window.location.origin + window.location.pathname
    const tabString = serializeToCompactFormat(tabs)
    const shareUrl = `${base}?tabs=${tabString}`
    
    navigator.clipboard.writeText(shareUrl)
    alert('Link copied!')
  }

  return (
    <button onClick={generateShareLink}>
      Share Current Layout
    </button>
  )
}
```

### Custom Tab Creation

```typescript
import { getTabLabel } from '../utils/tabSerialization'

function createTab(type: string, modelId?: string): Tab {
  return {
    id: modelId ? `model-${modelId}` : type,
    type: type as Tab['type'],
    label: getTabLabel(type as Tab['type'], modelId),
    modelId: modelId
  }
}

// Usage
const modelListTab = createTab('modelList')
const viewerTab = createTab('modelViewer', '123')
```

### Validation and Error Handling

```typescript
import { parseCompactTabFormat } from '../utils/tabSerialization'

function SafeTabParser(urlString: string) {
  const defaultTabs = [{ id: 'models', type: 'modelList' as const }]
  
  try {
    const tabs = parseCompactTabFormat(urlString, defaultTabs)
    
    // Validate tabs
    const validTabs = tabs.filter(tab => 
      ['modelList', 'modelViewer', 'texture', 'animation'].includes(tab.type)
    )
    
    return validTabs.length > 0 ? validTabs : defaultTabs
  } catch (error) {
    console.error('Tab parsing failed:', error)
    return defaultTabs
  }
}
```

## Tab Type Validation

The parser validates tab types against allowed values:

```typescript
const validTypes = ['modelList', 'modelViewer', 'texture', 'animation']

if (!validTypes.includes(tabType)) {
  throw new Error(`Invalid tab type: ${type}`)
}
```

Invalid types cause the parser to return the default value.

## Backward Compatibility

The parser supports legacy JSON format:

```typescript
// Old format (still supported)
const jsonTabs = '[{"id":"models","type":"modelList"}]'
parseCompactTabFormat(jsonTabs)
// Works! Returns parsed tabs

// New format (preferred)
const compactTabs = 'modelList'
parseCompactTabFormat(compactTabs)
// Also works! More concise
```

## URL Examples

### Simple Layout

```
?leftTabs=modelList&rightTabs=
```

Left panel has model list, right panel is empty.

### Model Viewer

```
?leftTabs=modelList&rightTabs=modelViewer:123&activeRight=model-123
```

Left panel has model list, right panel shows model 123.

### Complex Layout

```
?leftTabs=modelList,texture&rightTabs=modelViewer:5,modelViewer:10&activeLeft=texture&activeRight=model-10
```

Left panel has models and textures (textures active), right panel has two model viewers (model 10 active).

### Shareable Configuration

```
?split=70&leftTabs=modelList&rightTabs=modelViewer:123,texture&activeRight=texture
```

70/30 split, model list on left, model viewer and textures on right (textures active).

## Performance

- **Fast parsing**: Simple string operations, no heavy computation
- **Compact format**: Reduces URL length significantly
- **Type-safe**: TypeScript ensures correct tab structure
- **Efficient**: No unnecessary re-renders when tabs don't change

## Comparison: JSON vs Compact Format

| Aspect | JSON Format | Compact Format |
|--------|-------------|----------------|
| **Size** | `[{"id":"models","type":"modelList"}]` (38 chars) | `modelList` (9 chars) |
| **Readability** | Low (URL-encoded JSON) | High (human-readable) |
| **Shareability** | Poor (long URLs) | Good (short URLs) |
| **Backward Compatible** | - | Yes (supports both) |

## Related

- [SplitterLayout](../components/SplitterLayout.md) - Uses tab serialization
- [DockPanel](../components/DockPanel.md) - Tab container
- [useTabContext](../hooks/useTabContext.md) - Tab management
- [Tab Types](../types/index.md) - Tab type definitions
