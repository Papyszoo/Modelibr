import { createContext, ReactNode, useState, useContext } from 'react'
import { Tab } from '../types'

interface DockContextValue {
  recentlyClosedTabs: Tab[]
  addRecentlyClosedTab: (tab: Tab) => void
  removeRecentlyClosedTab: (tabId: string) => void
}

const DockContext = createContext<DockContextValue | null>(null)

export const useDockContext = (): DockContextValue => {
  const context = useContext(DockContext)
  if (!context) {
    throw new Error('useDockContext must be used within a DockProvider')
  }
  return context
}

interface DockProviderProps {
  children: ReactNode
}

export const DockProvider = ({ children }: DockProviderProps): JSX.Element => {
  const [recentlyClosedTabs, setRecentlyClosedTabs] = useState<Tab[]>([])

  const addRecentlyClosedTab = (tab: Tab): void => {
    setRecentlyClosedTabs(prev => {
      const updated = [tab, ...prev.filter(t => t.id !== tab.id)]
      return updated.slice(0, 5) // Keep only last 5
    })
  }

  const removeRecentlyClosedTab = (tabId: string): void => {
    setRecentlyClosedTabs(prev => prev.filter(t => t.id !== tabId))
  }

  const value: DockContextValue = {
    recentlyClosedTabs,
    addRecentlyClosedTab,
    removeRecentlyClosedTab,
  }

  return <DockContext.Provider value={value}>{children}</DockContext.Provider>
}

export default DockContext
