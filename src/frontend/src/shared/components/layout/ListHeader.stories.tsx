import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from 'primereact/button'

import { ListHeader } from './ListHeader'

const meta: Meta<typeof ListHeader> = {
  title: 'Shared/Layout/ListHeader',
  component: ListHeader,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['page', 'tab'],
    },
    title: { control: 'text' },
    subtitle: { control: 'text' },
  },
  args: {
    title: '3D Model Library',
    subtitle: 'Drag and drop 3D model files onto the table to upload.',
    variant: 'page',
  },
}

export default meta
type Story = StoryObj<typeof ListHeader>

export const Page: Story = {
  args: {
    actions: (
      <>
        <Button
          label="Upload"
          icon="pi pi-upload"
          className="p-button-outlined"
        />
        <Button
          label="Refresh"
          icon="pi pi-refresh"
          className="p-button-text"
        />
      </>
    ),
  },
}

export const Tab: Story = {
  args: {
    variant: 'tab',
    title: 'Texture Sets',
    subtitle: undefined,
    stats: [{ icon: 'pi-palette', label: '42 sets' }],
    actions: (
      <Button
        label="Create Set"
        icon="pi pi-plus"
        className="p-button-primary"
      />
    ),
  },
}

export const TitleOnly: Story = {
  args: {
    subtitle: undefined,
    actions: undefined,
  },
}

export const StatsAndActions: Story = {
  args: {
    title: 'Stages',
    subtitle: 'Visual environments for 3D scene composition.',
    stats: [
      { icon: 'pi-th-large', label: '7 stages' },
      { icon: 'pi-clock', label: 'Updated today' },
    ],
    actions: (
      <Button
        label="Create Stage"
        icon="pi pi-plus"
        className="p-button-primary"
      />
    ),
  },
}
