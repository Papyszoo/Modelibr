import { Tab } from '@/types'
import DockPanelContent from './DockPanelContent'
import './DockPanel.css'

interface DockPanelProps {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  otherTabs: Tab[]
  setOtherTabs: (tabs: Tab[]) => void
  otherActiveTab: string
  setOtherActiveTab: (tabId: string) => void
  draggedTab: Tab | null
  setDraggedTab: (tab: Tab | null) => void
  moveTabBetweenPanels: (tab: Tab, fromSide: 'left' | 'right') => void
}

function DockPanel(props: DockPanelProps): JSX.Element {
  return <DockPanelContent {...props} />
}

export default DockPanel
