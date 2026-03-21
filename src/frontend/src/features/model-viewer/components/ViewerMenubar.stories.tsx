import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { type PanelContent, ViewerMenubar } from './ViewerMenubar'

const noop = () => {}

const meta: Meta<typeof ViewerMenubar> = {
  title: 'Components/ViewerMenubar',
  component: ViewerMenubar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    leftPanel: 'hierarchy',
    rightPanel: 'materials',
    topPanel: null,
    bottomPanel: 'uvMap',
    onLeftPanelChange: noop,
    onRightPanelChange: noop,
    onTopPanelChange: noop,
    onBottomPanelChange: noop,
    onAddVersion: noop,
  },
}

export default meta
type Story = StoryObj<typeof ViewerMenubar>

export const Default: Story = {}

export const NoPanels: Story = {
  args: {
    leftPanel: null,
    rightPanel: null,
    topPanel: null,
    bottomPanel: null,
  },
}

export const AllPanels: Story = {
  args: {
    leftPanel: 'hierarchy',
    rightPanel: 'materials',
    topPanel: 'modelInfo',
    bottomPanel: 'uvMap',
  },
}

function InteractiveDemo() {
  const [leftPanel, setLeftPanel] = useState<PanelContent>('hierarchy')
  const [rightPanel, setRightPanel] = useState<PanelContent>('materials')
  const [topPanel, setTopPanel] = useState<PanelContent>(null)
  const [bottomPanel, setBottomPanel] = useState<PanelContent>('uvMap')

  return (
    <ViewerMenubar
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      topPanel={topPanel}
      bottomPanel={bottomPanel}
      onLeftPanelChange={setLeftPanel}
      onRightPanelChange={setRightPanel}
      onTopPanelChange={setTopPanel}
      onBottomPanelChange={setBottomPanel}
      onAddVersion={() => alert('Add version clicked')}
    />
  )
}

export const Interactive: Story = {
  render: () => <InteractiveDemo />,
}
