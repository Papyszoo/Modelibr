import type { Meta, StoryObj } from '@storybook/react'
import { Button } from 'primereact/button'
import { useState } from 'react'

import { ModelProvider } from '@/contexts/ModelContext'

import { UVMapWindow } from './UVMapWindow'

const meta = {
  title: 'Components/UVMapWindow',
  component: UVMapWindow,
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
} satisfies Meta<typeof UVMapWindow>

export default meta
type Story = StoryObj<typeof meta>

function DemoWrapper() {
  const [visible, setVisible] = useState(true)

  return (
    <div style={{ padding: '2rem' }}>
      <Button
        label="Toggle UV Map Window"
        icon="pi pi-map"
        onClick={() => setVisible(!visible)}
      />
      <UVMapWindow
        visible={visible}
        onClose={() => setVisible(false)}
        modelId="1"
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <DemoWrapper />,
}

export const NoModel: Story = {
  render: () => {
    function NoModelWrapper() {
      const [visible, setVisible] = useState(true)
      return (
        <div style={{ padding: '2rem' }}>
          <Button
            label="Toggle UV Map Window (No Model)"
            icon="pi pi-map"
            onClick={() => setVisible(!visible)}
          />
          <UVMapWindow
            visible={visible}
            onClose={() => setVisible(false)}
            modelId={null}
          />
        </div>
      )
    }
    return <NoModelWrapper />
  },
}
