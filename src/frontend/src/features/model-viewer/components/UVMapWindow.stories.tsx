import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import UVMapWindow from './UVMapWindow'
import { ModelProvider } from '../../../contexts/ModelContext'
import { Button } from 'primereact/button'
import { Model } from '../../../utils/fileUtils'

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

const mockModel: Model = {
  id: 1,
  name: 'Test Model',
  createdAt: new Date().toISOString(),
  files: [
    {
      id: 1,
      modelId: 1,
      originalFileName: 'cube.obj',
      storedFileName: 'cube.obj',
      sizeInBytes: 1024,
      uploadedAt: new Date().toISOString(),
      hash: 'test-hash',
      isRenderable: true,
    },
  ],
}

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
        model={mockModel}
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
            model={null}
          />
        </div>
      )
    }
    return <NoModelWrapper />
  },
}
