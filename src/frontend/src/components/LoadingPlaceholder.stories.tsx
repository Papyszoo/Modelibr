import type { Meta, StoryObj } from '@storybook/react-vite'
import { Canvas } from '@react-three/fiber'
import { LoadingPlaceholder } from './LoadingPlaceholder'

const meta = {
  title: 'Components/LoadingPlaceholder',
  component: LoadingPlaceholder,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div style={{ width: '100vw', height: '100vh', background: '#242424' }}>
        <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
          <ambientLight intensity={0.5} />
          <Story />
        </Canvas>
      </div>
    ),
  ],
} satisfies Meta<typeof LoadingPlaceholder>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
