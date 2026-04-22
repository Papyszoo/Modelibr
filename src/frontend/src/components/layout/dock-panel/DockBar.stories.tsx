import type { Meta, StoryObj } from '@storybook/react'

import { DockContext } from '@/contexts/DockContext'
import { type Tab } from '@/types'

import { DockBar, type DockPlacement } from './DockBar'
import {
  type DockPanelActions,
  DockPanelActionsContext,
} from './DockPanelActionsContext'

const noop = () => {}

const mockActions: DockPanelActions = {
  addTab: noop,
  reopenTab: noop,
  closeTab: noop,
  onTabDragStart: noop,
  onTabDragEnd: noop,
  onDrop: e => e.preventDefault(),
  onDragOver: e => e.preventDefault(),
  onDragEnter: noop,
  onDragLeave: noop,
}

const mockDockContext = {
  recentlyClosedTabs: [],
  addRecentlyClosedTab: noop,
  removeRecentlyClosedTab: noop,
  registerContextMenu: noop,
  unregisterContextMenu: noop,
  showContextMenu: noop,
}

const sampleTabs: Tab[] = [
  {
    id: 'models',
    type: 'modelList',
    label: 'Models',
    params: {},
    internalUiState: {},
  },
  {
    id: 'texture-sets',
    type: 'textureSets',
    label: 'Texture Sets',
    params: {},
    internalUiState: {},
  },
  {
    id: 'packs',
    type: 'packs',
    label: 'Packs',
    params: {},
    internalUiState: {},
  },
  {
    id: 'settings',
    type: 'settings',
    label: 'Settings',
    params: {},
    internalUiState: {},
  },
]

const FLEX_DIR_BY_PLACEMENT: Record<DockPlacement, string> = {
  left: 'row',
  right: 'row-reverse',
  top: 'column',
  bottom: 'column-reverse',
}

const meta: Meta<typeof DockBar> = {
  title: 'Layout/DockBar',
  component: DockBar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Bar that hosts tab icons and the add-tab button. Vertical for `left`/`right` placements, horizontal for `top`/`bottom`.',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const placement = (ctx.args.placement ?? 'left') as DockPlacement
      return (
        <DockContext.Provider value={mockDockContext}>
          <DockPanelActionsContext.Provider value={mockActions}>
            <div
              style={{
                height: '100vh',
                width: '100vw',
                display: 'flex',
                flexDirection: FLEX_DIR_BY_PLACEMENT[placement] as
                  | 'row'
                  | 'row-reverse'
                  | 'column'
                  | 'column-reverse',
                background: 'var(--surface-ground)',
              }}
            >
              <Story />
              <div
                style={{
                  flex: 1,
                  padding: '1rem',
                  color: 'var(--text-color-secondary)',
                }}
              >
                Content area
              </div>
            </div>
          </DockPanelActionsContext.Provider>
        </DockContext.Provider>
      )
    },
  ],
  argTypes: {
    placement: {
      control: 'select',
      options: ['left', 'right', 'top', 'bottom'],
    },
  },
  args: {
    tabs: sampleTabs,
    activeTab: 'models',
    onTabSelect: () => {},
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Left: Story = { args: { placement: 'left' } }
export const Right: Story = { args: { placement: 'right' } }
export const Top: Story = { args: { placement: 'top' } }
export const Bottom: Story = { args: { placement: 'bottom' } }
