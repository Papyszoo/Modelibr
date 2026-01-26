import { useMemo } from 'react'
import { MenuItem } from 'primereact/menuitem'
import { Tab } from '../types'

interface UseTabMenuItemsProps {
  onAddTab: (type: Tab['type'], title: string) => void
  recentlyClosedTabs: Tab[]
  onReopenTab: (tab: Tab) => void
}

export const useTabMenuItems = ({
  onAddTab,
  recentlyClosedTabs,
  onReopenTab,
}: UseTabMenuItemsProps): MenuItem[] => {
  return useMemo(() => {
    const menuItems: MenuItem[] = [
      {
        label: 'Models List',
        icon: 'pi pi-list',
        command: () => onAddTab('modelList', 'Models'),
      },
      {
        label: 'Texture Sets',
        icon: 'pi pi-folder',
        command: () => onAddTab('textureSets', 'Texture Sets'),
      },
      {
        label: 'Sprites',
        icon: 'pi pi-image',
        command: () => onAddTab('sprites', 'Sprites'),
      },
      {
        label: 'Sounds',
        icon: 'pi pi-volume-up',
        command: () => onAddTab('sounds', 'Sounds'),
      },
      {
        label: 'Packs',
        icon: 'pi pi-inbox',
        command: () => onAddTab('packs', 'Packs'),
      },
      {
        label: 'Projects',
        icon: 'pi pi-briefcase',
        command: () => onAddTab('projects', 'Projects'),
      },
      {
        label: 'Stages',
        icon: 'pi pi-box',
        command: () => onAddTab('stageList', 'Stages'),
      },
      {
        label: 'History',
        icon: 'pi pi-history',
        command: () => onAddTab('history', 'History'),
      },
      {
        label: 'Recycled Files',
        icon: 'pi pi-trash',
        command: () => onAddTab('recycledFiles', 'Recycled Files'),
      },
      {
        separator: true,
      },
      {
        label: 'Settings',
        icon: 'pi pi-cog',
        command: () => onAddTab('settings', 'Settings'),
      },
    ]

    // Add recently closed tabs to menu if any exist
    if (recentlyClosedTabs.length > 0) {
      menuItems.push(
        {
          separator: true,
        },
        ...recentlyClosedTabs.map(tab => ({
          label: `Reopen: ${tab.label || tab.type}`,
          icon: 'pi pi-history',
          command: () => onReopenTab(tab),
        }))
      )
    }

    return menuItems
  }, [onAddTab, recentlyClosedTabs, onReopenTab])
}
