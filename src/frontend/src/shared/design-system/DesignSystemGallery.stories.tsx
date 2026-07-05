import type { Meta, StoryObj } from '@storybook/react-vite'

import { DesignSystemGallery } from './DesignSystemGallery'

/**
 * The whole design system on one page — see the `design-system` skill.
 * Explicit Dark and Light stories pin the theme global so the
 * storybook-visual suite snapshots both modes.
 */
const meta: Meta<typeof DesignSystemGallery> = {
  title: 'Design System/Gallery',
  component: DesignSystemGallery,
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof DesignSystemGallery>

export const Dark: Story = {
  globals: { theme: 'dark' },
}

export const Light: Story = {
  globals: { theme: 'light' },
}
