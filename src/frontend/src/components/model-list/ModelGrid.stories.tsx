import type { Meta, StoryObj } from '@storybook/react'
import ModelGrid from './ModelGrid'
import { Model } from '../../utils/fileUtils'

const mockModels: Model[] = [
  {
    id: '1',
    name: 'Sci-Fi Spaceship',
    createdAt: new Date('2024-01-01').toISOString(),
    files: [
      {
        id: '1',
        originalFileName: 'spaceship.obj',
        storedFileName: 'stored1.obj',
        sizeBytes: 2500000,
        hash: 'hash1',
        uploadedAt: new Date('2024-01-01').toISOString(),
      },
    ],
  },
  {
    id: '2',
    name: 'Medieval Castle',
    createdAt: new Date('2024-01-02').toISOString(),
    files: [
      {
        id: '2',
        originalFileName: 'castle.glb',
        storedFileName: 'stored2.glb',
        sizeBytes: 5000000,
        hash: 'hash2',
        uploadedAt: new Date('2024-01-02').toISOString(),
      },
    ],
  },
  {
    id: '3',
    name: 'Modern Chair',
    createdAt: new Date('2024-01-03').toISOString(),
    files: [
      {
        id: '3',
        originalFileName: 'chair.gltf',
        storedFileName: 'stored3.gltf',
        sizeBytes: 750000,
        hash: 'hash3',
        uploadedAt: new Date('2024-01-03').toISOString(),
      },
    ],
  },
  {
    id: '4',
    name: 'Fantasy Dragon',
    createdAt: new Date('2024-01-04').toISOString(),
    files: [
      {
        id: '4',
        originalFileName: 'dragon.obj',
        storedFileName: 'stored4.obj',
        sizeBytes: 8000000,
        hash: 'hash4',
        uploadedAt: new Date('2024-01-04').toISOString(),
      },
    ],
  },
  {
    id: '5',
    name: 'City Building',
    createdAt: new Date('2024-01-05').toISOString(),
    files: [
      {
        id: '5',
        originalFileName: 'building.glb',
        storedFileName: 'stored5.glb',
        sizeBytes: 10000000,
        hash: 'hash5',
        uploadedAt: new Date('2024-01-05').toISOString(),
      },
    ],
  },
  {
    id: '6',
    name: 'Racing Car',
    createdAt: new Date('2024-01-06').toISOString(),
    files: [
      {
        id: '6',
        originalFileName: 'car.obj',
        storedFileName: 'stored6.obj',
        sizeBytes: 3500000,
        hash: 'hash6',
        uploadedAt: new Date('2024-01-06').toISOString(),
      },
    ],
  },
]

const meta: Meta<typeof ModelGrid> = {
  title: 'Components/ModelGrid',
  component: ModelGrid,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof ModelGrid>

export const Default: Story = {
  args: {
    models: mockModels,
    onModelSelect: (model: Model) => console.log('Selected model:', model),
    isTabContent: false,
    onDrop: (e: React.DragEvent) => console.log('Drop:', e),
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDragEnter: (e: React.DragEvent) => console.log('Drag enter:', e),
    onDragLeave: (e: React.DragEvent) => console.log('Drag leave:', e),
  },
}

export const TabContent: Story = {
  args: {
    ...Default.args,
    isTabContent: true,
  },
}

export const EmptyGrid: Story = {
  args: {
    ...Default.args,
    models: [],
  },
}

export const FewModels: Story = {
  args: {
    ...Default.args,
    models: mockModels.slice(0, 3),
  },
}

export const ManyModels: Story = {
  args: {
    ...Default.args,
    models: [
      ...mockModels,
      ...mockModels.map((m, i) => ({
        ...m,
        id: `${parseInt(m.id) + 6 + i}`,
        name: `${m.name} (Copy ${i + 1})`,
      })),
    ],
  },
}
