# TabContext

React context for tab management within dock panels.

## Purpose

Provides centralized tab state management:
- Tab creation and deletion
- Active tab tracking
- Model viewer tab shortcuts
- Cross-component tab coordination

## Import

```typescript
import TabContext, { type TabContextValue } from '../contexts/TabContext'
import { useTabContext, TabProvider } from '../hooks/useTabContext'
```

## Context Value

### TabContextValue Interface

```typescript
interface TabContextValue {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  openModelDetailsTab: (model: Model) => void
  openTab: (type: Tab['type'], title: string, data?: unknown) => void
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `side` | `'left' \| 'right'` | Which dock panel this context belongs to |
| `tabs` | `Tab[]` | Current array of tabs |
| `setTabs` | `(tabs: Tab[]) => void` | Update tabs array |
| `activeTab` | `string` | ID of currently active tab |
| `setActiveTab` | `(tabId: string) => void` | Set active tab |
| `openModelDetailsTab` | `(model: Model) => void` | Shortcut to open model viewer |
| `openTab` | `(type, title, data?) => void` | Generic tab opener |

## Tab Interface

```typescript
interface Tab {
  id: string
  type: 'modelList' | 'modelViewer' | 'texture' | 'animation' | 'texturePacks'
  label?: string
  modelId?: string
}
```

## Usage

### Provider Setup

The TabProvider wraps components that need tab context:

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
      <TabBar />
      <TabContent />
    </TabProvider>
  )
}
```

### Consuming Context

Use the `useTabContext` hook to access the context:

```typescript
import { useTabContext } from '../hooks/useTabContext'

function TabBar() {
  const { tabs, activeTab, setActiveTab } = useTabContext()

  return (
    <div className="tab-bar">
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

## Methods

### openModelDetailsTab

Opens a model viewer tab, or switches to it if already open.

#### Signature

```typescript
openModelDetailsTab(model: Model): void
```

#### Behavior

1. Checks if viewer tab for this model already exists
2. If exists: Activates the existing tab
3. If not: Creates new tab and activates it

#### Tab Structure

```typescript
{
  id: `model-${model.id}`,
  type: 'modelViewer',
  label: model.name || `Model ${model.id}`,
  modelId: model.id
}
```

#### Example

```typescript
import { useTabContext } from '../hooks/useTabContext'

function ModelCard({ model }) {
  const { openModelDetailsTab } = useTabContext()

  return (
    <div className="model-card">
      <h3>{model.name}</h3>
      <button onClick={() => openModelDetailsTab(model)}>
        View in 3D
      </button>
    </div>
  )
}
```

### openTab

Opens a generic tab by type and title.

#### Signature

```typescript
openTab(type: Tab['type'], title: string, data?: unknown): void
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `Tab['type']` | Tab type |
| `title` | `string` | Display title |
| `data` | `unknown` | Optional data (e.g., model object) |

#### Behavior

1. Checks if tab of this type already exists
2. For singleton types (modelList, texture, animation): Activates existing
3. For modelViewer with same modelId: Activates existing
4. Otherwise: Creates new tab and activates it

#### Examples

```typescript
const { openTab } = useTabContext()

// Open model list
openTab('modelList', 'Models')

// Open textures
openTab('texture', 'Textures')

// Open animations
openTab('animation', 'Animations')

// Open texture packs
openTab('texturePacks', 'Texture Packs')

// Open specific model viewer
openTab('modelViewer', 'My Model', { id: '123' })
```

## Examples

### Basic Tab Management

```typescript
import { useTabContext } from '../hooks/useTabContext'

function TabManager() {
  const { tabs, setTabs, activeTab, setActiveTab } = useTabContext()

  const closeTab = (tabId: string) => {
    const newTabs = tabs.filter(t => t.id !== tabId)
    setTabs(newTabs)
    
    // If closed active tab, activate another
    if (activeTab === tabId && newTabs.length > 0) {
      setActiveTab(newTabs[0].id)
    }
  }

  const closeAllTabs = () => {
    setTabs([])
    setActiveTab('')
  }

  return (
    <div>
      <button onClick={closeAllTabs}>Close All</button>
      {tabs.map(tab => (
        <div key={tab.id}>
          <span>{tab.label}</span>
          <button onClick={() => closeTab(tab.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
```

### Model List Integration

```typescript
import { useTabContext } from '../hooks/useTabContext'

function ModelListItem({ model }) {
  const { openModelDetailsTab, side } = useTabContext()

  const handleClick = () => {
    openModelDetailsTab(model)
    console.log(`Opened model in ${side} panel`)
  }

  return (
    <div onClick={handleClick}>
      <h4>{model.name}</h4>
      <p>Click to view in 3D</p>
    </div>
  )
}
```

### Navigation Menu

```typescript
import { useTabContext } from '../hooks/useTabContext'

function NavigationMenu() {
  const { openTab, activeTab } = useTabContext()

  const menuItems = [
    { type: 'modelList', label: 'Models', icon: 'pi-box' },
    { type: 'texture', label: 'Textures', icon: 'pi-image' },
    { type: 'animation', label: 'Animations', icon: 'pi-video' },
    { type: 'texturePacks', label: 'Texture Packs', icon: 'pi-folder' },
  ]

  return (
    <nav>
      {menuItems.map(item => (
        <button
          key={item.type}
          onClick={() => openTab(item.type, item.label)}
          className={activeTab === item.type ? 'active' : ''}
        >
          <i className={`pi ${item.icon}`} />
          {item.label}
        </button>
      ))}
    </nav>
  )
}
```

### Tab Content Renderer

```typescript
import { useTabContext } from '../hooks/useTabContext'

function TabContent() {
  const { tabs, activeTab } = useTabContext()

  const activeTabData = tabs.find(t => t.id === activeTab)

  if (!activeTabData) {
    return <div className="empty-state">No tab selected</div>
  }

  switch (activeTabData.type) {
    case 'modelList':
      return <ModelList />
    case 'modelViewer':
      return <ModelViewer modelId={activeTabData.modelId} />
    case 'texture':
      return <TextureList />
    case 'animation':
      return <AnimationList />
    case 'texturePacks':
      return <TexturePackList />
    default:
      return <div>Unknown tab type</div>
  }
}
```

### Conditional Rendering

```typescript
import { useTabContext } from '../hooks/useTabContext'

function ContextualActions() {
  const { tabs, activeTab, side } = useTabContext()
  const currentTab = tabs.find(t => t.id === activeTab)

  if (!currentTab) return null

  return (
    <div className="actions">
      <span>{side} Panel</span>
      
      {currentTab.type === 'modelViewer' && (
        <button>Download Model</button>
      )}
      
      {currentTab.type === 'texture' && (
        <button>Upload Texture</button>
      )}
      
      {tabs.length > 1 && (
        <button>Close Tab</button>
      )}
    </div>
  )
}
```

### Keyboard Navigation

```typescript
import { useTabContext } from '../hooks/useTabContext'
import { useEffect } from 'react'

function TabKeyboardNav() {
  const { tabs, activeTab, setActiveTab } = useTabContext()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const currentIndex = tabs.findIndex(t => t.id === activeTab)
        
        if (e.key === 'ArrowRight') {
          // Next tab
          const nextIndex = (currentIndex + 1) % tabs.length
          setActiveTab(tabs[nextIndex].id)
          e.preventDefault()
        } else if (e.key === 'ArrowLeft') {
          // Previous tab
          const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
          setActiveTab(tabs[prevIndex].id)
          e.preventDefault()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tabs, activeTab, setActiveTab])

  return null // No UI, just keyboard handler
}
```

## Error Handling

The `useTabContext` hook throws an error if used outside a provider:

```typescript
function InvalidComponent() {
  try {
    const context = useTabContext()
    // This will throw
  } catch (error) {
    console.error(error.message)
    // "useTabContext must be used within a TabProvider"
  }
}
```

Always ensure components are wrapped in TabProvider:

```typescript
// ✅ Correct
<TabProvider {...props}>
  <ComponentUsingContext />
</TabProvider>

// ❌ Wrong - will throw error
<ComponentUsingContext />
```

## State Flow

```
Parent Component (e.g., SplitterLayout)
    ↓ (provides state)
TabProvider (wraps children)
    ↓ (provides context)
Child Components (useTabContext)
    ↓ (consume context)
Tab Operations (update state via context)
    ↓ (triggers re-render)
Parent Component (state updates)
```

## Related

- [useTabContext](../hooks/useTabContext.md) - Hook for accessing context
- [TabProvider](../hooks/useTabContext.md#tabprovider) - Provider component
- [DockPanel](../components/DockPanel.md) - Uses TabProvider
- [SplitterLayout](../components/SplitterLayout.md) - Manages tab state
