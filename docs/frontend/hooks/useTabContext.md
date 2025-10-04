# useTabContext

Custom hook for accessing tab context within dock panels.

## Purpose

Provides access to tab management functionality within the dock panel system:
- Tab creation and removal
- Active tab tracking
- Model viewer tab management
- Generic tab opening

## Import

```typescript
import { useTabContext, TabProvider } from '../hooks/useTabContext'
```

## API

### useTabContext()

Hook to access the tab context. Must be used within a `TabProvider`.

#### Return Value (TabContextValue)

| Property | Type | Description |
|----------|------|-------------|
| `side` | `'left' \| 'right'` | Which panel side this context belongs to |
| `tabs` | `Tab[]` | Array of current tabs |
| `setTabs` | `(tabs: Tab[]) => void` | Function to update tabs |
| `activeTab` | `string` | ID of the currently active tab |
| `setActiveTab` | `(tabId: string) => void` | Function to set active tab |
| `openModelDetailsTab` | `(model: Model) => void` | Open a model viewer tab |
| `openTab` | `(type, title, data?) => void` | Open a generic tab |

#### Tab Object

```typescript
{
  id: string,              // Unique tab identifier
  type: 'modelList' | 'modelViewer' | 'texture' | 'animation' | 'texturePacks',
  label?: string,          // Display label
  modelId?: string        // For modelViewer tabs
}
```

## Usage Examples

### Basic Tab Context Access

```typescript
import { useTabContext } from '../hooks/useTabContext'

function MyTabComponent() {
  const { tabs, activeTab, setActiveTab } = useTabContext()

  return (
    <div>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={activeTab === tab.id ? 'active' : ''}
        >
          {tab.label || tab.id}
        </button>
      ))}
    </div>
  )
}
```

### Opening a Model Viewer Tab

```typescript
import { useTabContext } from '../hooks/useTabContext'

function ModelListItem({ model }) {
  const { openModelDetailsTab } = useTabContext()

  const handleViewClick = () => {
    openModelDetailsTab(model)
  }

  return (
    <div>
      <h3>{model.name}</h3>
      <button onClick={handleViewClick}>View 3D Model</button>
    </div>
  )
}
```

### Opening Generic Tabs

```typescript
import { useTabContext } from '../hooks/useTabContext'

function NavigationMenu() {
  const { openTab } = useTabContext()

  return (
    <nav>
      <button onClick={() => openTab('modelList', 'Models')}>
        Models
      </button>
      <button onClick={() => openTab('texture', 'Textures')}>
        Textures
      </button>
      <button onClick={() => openTab('animation', 'Animations')}>
        Animations
      </button>
      <button onClick={() => openTab('texturePacks', 'Texture Packs')}>
        Texture Packs
      </button>
    </nav>
  )
}
```

### Tab Management with State

```typescript
import { useTabContext } from '../hooks/useTabContext'

function TabManager() {
  const { tabs, setTabs, activeTab } = useTabContext()

  const closeTab = (tabId) => {
    const newTabs = tabs.filter(t => t.id !== tabId)
    setTabs(newTabs)
  }

  const closeAllTabs = () => {
    setTabs([])
  }

  return (
    <div>
      <button onClick={closeAllTabs}>Close All</button>
      {tabs.map(tab => (
        <div key={tab.id} className={activeTab === tab.id ? 'active' : ''}>
          <span>{tab.label}</span>
          <button onClick={() => closeTab(tab.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
```

## TabProvider

Provider component that wraps components needing tab context.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Child components |
| `side` | `'left' \| 'right'` | Panel side identifier |
| `tabs` | `Tab[]` | Current tabs array |
| `setTabs` | `(tabs: Tab[]) => void` | Function to update tabs |
| `activeTab` | `string` | Currently active tab ID |
| `setActiveTab` | `(tabId: string) => void` | Function to set active tab |

### Usage Example

```typescript
import { TabProvider } from '../hooks/useTabContext'

function DockPanel({ side, tabs, setTabs, activeTab, setActiveTab }) {
  return (
    <TabProvider
      side={side}
      tabs={tabs}
      setTabs={setTabs}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      <TabContent />
      <TabBar />
    </TabProvider>
  )
}
```

## Smart Tab Behavior

### Duplicate Prevention

The context automatically prevents duplicate tabs:

```typescript
// If a model viewer tab for model #5 already exists:
openModelDetailsTab({ id: '5', name: 'Model 5' })
// Instead of creating a new tab, it activates the existing one
```

### Automatic Tab Activation

When a new tab is created, it's automatically activated:

```typescript
openTab('texture', 'Textures')
// Creates tab AND sets it as active
```

### Model-Specific Tabs

Model viewer tabs have special handling:

```typescript
const { openModelDetailsTab } = useTabContext()

// Creates tab with ID: 'model-123'
openModelDetailsTab({ 
  id: '123', 
  name: 'My Model',
  files: [...] 
})

// If tab 'model-123' exists, just activates it
openModelDetailsTab({ id: '123', name: 'My Model' })
```

## Integration with URL State

Tabs are typically persisted to URL using `nuqs`:

```typescript
import { useQueryState } from 'nuqs'
import { TabProvider } from '../hooks/useTabContext'

function PersistentDockPanel() {
  const [tabs, setTabs] = useQueryState('tabs', {
    defaultValue: [],
    // ... serialization logic
  })
  
  const [activeTab, setActiveTab] = useQueryState('active', {
    defaultValue: ''
  })

  return (
    <TabProvider
      side="left"
      tabs={tabs}
      setTabs={setTabs}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      {/* Content */}
    </TabProvider>
  )
}
```

## Error Handling

The hook throws an error if used outside a provider:

```typescript
function InvalidUsage() {
  // ❌ This will throw an error
  const context = useTabContext()
  // Error: useTabContext must be used within a TabProvider
}

function ValidUsage() {
  return (
    <TabProvider {...props}>
      {/* ✅ This works */}
      <ComponentUsingTabContext />
    </TabProvider>
  )
}
```

## Related

- [DockPanel](../components/DockPanel.md) - Main container using TabProvider
- [TabContent](../components/TabContent.md) - Renders tab content using context
- [DraggableTab](../components/DraggableTab.md) - Tab component using context
- [TabContext](../contexts/TabContext.md) - The underlying context
