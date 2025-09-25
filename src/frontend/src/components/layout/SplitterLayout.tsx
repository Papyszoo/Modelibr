import { Splitter, SplitterPanel } from 'primereact/splitter'
import { useQueryState } from 'nuqs'
import DockPanel from './DockPanel'
import { Tab, SplitterEvent } from '../../types'
import './SplitterLayout.css'

function SplitterLayout(): JSX.Element {
  // URL state for splitter size (percentage for left panel)
  const [splitterSize, setSplitterSize] = useQueryState('split', {
    defaultValue: '50',
    parse: value => value || '50',
    serialize: value => value,
  })

  // URL state for left panel tabs
  const [leftTabs, setLeftTabs] = useQueryState('leftTabs', {
    defaultValue: [{ id: 'models', type: 'modelList' }] as Tab[],
    parse: (value): Tab[] => {
      if (!value) return [{ id: 'models', type: 'modelList' }]
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed)
          ? parsed
          : [{ id: 'models', type: 'modelList' }]
      } catch {
        return [{ id: 'models', type: 'modelList' }]
      }
    },
    serialize: value => JSON.stringify(value),
  })

  // URL state for right panel tabs
  const [rightTabs, setRightTabs] = useQueryState('rightTabs', {
    defaultValue: [] as Tab[],
    parse: (value): Tab[] => {
      if (!value) return []
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    },
    serialize: value => JSON.stringify(value),
  })

  // URL state for active tabs
  const [activeLeftTab, setActiveLeftTab] = useQueryState('activeLeft', {
    defaultValue: 'models',
    parse: value => value || 'models',
    serialize: value => value,
  })

  const [activeRightTab, setActiveRightTab] = useQueryState('activeRight', {
    defaultValue: '',
    parse: value => value || '',
    serialize: value => value,
  })

  const handleSplitterResize = (event: SplitterEvent): void => {
    const leftSize = Math.round(event.sizes[0])
    setSplitterSize(leftSize.toString())
  }

  // Calculate initial sizes for splitter
  const leftSize = parseInt(splitterSize, 10)
  const rightSize = 100 - leftSize

  return (
    <div className="splitter-layout">
      <Splitter
        layout="horizontal"
        onResize={handleSplitterResize}
        resizerStyle={{ background: '#e2e8f0', width: '4px' }}
      >
        <SplitterPanel size={leftSize} minSize={20}>
          <DockPanel
            side="left"
            tabs={leftTabs}
            setTabs={setLeftTabs}
            activeTab={activeLeftTab}
            setActiveTab={setActiveLeftTab}
            otherTabs={rightTabs}
            setOtherTabs={setRightTabs}
            otherActiveTab={activeRightTab}
            setOtherActiveTab={setActiveRightTab}
          />
        </SplitterPanel>
        <SplitterPanel size={rightSize} minSize={20}>
          <DockPanel
            side="right"
            tabs={rightTabs}
            setTabs={setRightTabs}
            activeTab={activeRightTab}
            setActiveTab={setActiveRightTab}
            otherTabs={leftTabs}
            setOtherTabs={setLeftTabs}
            otherActiveTab={activeLeftTab}
            setOtherActiveTab={setActiveLeftTab}
          />
        </SplitterPanel>
      </Splitter>
    </div>
  )
}

export default SplitterLayout
