/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  ReactNode,
  useState,
  useContext,
  useRef,
  useEffect,
  RefObject,
} from 'react'
import { ContextMenu } from 'primereact/contextmenu'
import { Tab } from '../types'

interface DockContextValue {
  recentlyClosedTabs: Tab[]
  addRecentlyClosedTab: (tab: Tab) => void
  removeRecentlyClosedTab: (tabId: string) => void
  registerContextMenu: (ref: RefObject<ContextMenu>) => void
  unregisterContextMenu: (ref: RefObject<ContextMenu>) => void
  showContextMenu: (
    ref: RefObject<ContextMenu>,
    event: React.MouseEvent
  ) => void
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
  const contextMenuRefs = useRef<Set<RefObject<ContextMenu>>>(new Set())

  const addRecentlyClosedTab = (tab: Tab): void => {
    setRecentlyClosedTabs(prev => {
      const updated = [tab, ...prev.filter(t => t.id !== tab.id)]
      return updated.slice(0, 5) // Keep only last 5
    })
  }

  const removeRecentlyClosedTab = (tabId: string): void => {
    setRecentlyClosedTabs(prev => prev.filter(t => t.id !== tabId))
  }

  const registerContextMenu = (ref: RefObject<ContextMenu>): void => {
    contextMenuRefs.current.add(ref)
  }

  const unregisterContextMenu = (ref: RefObject<ContextMenu>): void => {
    contextMenuRefs.current.delete(ref)
  }

  const showContextMenu = (
    ref: RefObject<ContextMenu>,
    event: React.MouseEvent
  ): void => {
    // Hide all other menus immediately
    contextMenuRefs.current.forEach(otherRef => {
      if (otherRef !== ref && otherRef.current) {
        otherRef.current.hide()
      }
    })

    // Then show the requested menu
    if (ref.current) {
      ref.current.show(event)
    }
  }

  useEffect(() => {
    // Close all context menus when clicking anywhere
    const handleGlobalClick = (): void => {
      contextMenuRefs.current.forEach(ref => {
        if (ref.current) {
          ref.current.hide()
        }
      })
    }

    // Listen to both click and contextmenu events to close menus
    document.addEventListener('click', handleGlobalClick)
    document.addEventListener('contextmenu', handleGlobalClick)

    return () => {
      document.removeEventListener('click', handleGlobalClick)
      document.removeEventListener('contextmenu', handleGlobalClick)
    }
  }, [])

  const value: DockContextValue = {
    recentlyClosedTabs,
    addRecentlyClosedTab,
    removeRecentlyClosedTab,
    registerContextMenu,
    unregisterContextMenu,
    showContextMenu,
  }

  return <DockContext.Provider value={value}>{children}</DockContext.Provider>
}

export default DockContext
