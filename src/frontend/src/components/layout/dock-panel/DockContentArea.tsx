import TabContent from '../TabContent'
import { TabProvider } from '../../../hooks/useTabContext'
import { Tab } from '../../../types'

interface DockContentAreaProps {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  activeTabData: Tab | undefined
}

export default function DockContentArea({
  side,
  tabs,
  setTabs,
  activeTab,
  setActiveTab,
  activeTabData,
}: DockContentAreaProps) {
  if (!activeTabData) return null

  return (
    <TabProvider
      side={side}
      tabs={tabs}
      setTabs={setTabs}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      <TabContent key={activeTabData.id} tab={activeTabData} />
    </TabProvider>
  )
}
