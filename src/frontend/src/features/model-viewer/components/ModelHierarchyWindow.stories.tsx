import type { Meta, StoryObj } from '@storybook/react'
import { Button } from 'primereact/button'
import { useState } from 'react'
import * as THREE from 'three'

import { ModelProvider } from '@/contexts/ModelContext'

import { ModelHierarchyWindow } from './ModelHierarchyWindow'

const meta = {
  title: 'Components/ModelHierarchyWindow',
  component: ModelHierarchyWindow,
  decorators: [
    Story => (
      <ModelProvider>
        <div
          style={{
            position: 'relative',
            height: '100vh',
            background: '#f0f0f0',
          }}
        >
          <Story />
        </div>
      </ModelProvider>
    ),
  ],
} satisfies Meta<typeof ModelHierarchyWindow>

export default meta
type Story = StoryObj<typeof meta>

function DemoWrapper() {
  const [visible, setVisible] = useState(true)

  return (
    <div style={{ padding: '2rem' }}>
      <Button
        label="Toggle Hierarchy Window"
        icon="pi pi-sitemap"
        onClick={() => setVisible(!visible)}
      />
      <ModelHierarchyWindow
        visible={visible}
        onClose={() => setVisible(false)}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <DemoWrapper />,
}
