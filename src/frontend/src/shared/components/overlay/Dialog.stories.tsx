import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from 'primereact/button'
import { useState } from 'react'

import { Dialog } from './Dialog'

const meta: Meta<typeof Dialog> = {
  title: 'Shared/Overlay/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg', 'xl', 'full'],
    },
    header: { control: 'text' },
  },
  args: {
    open: true,
    onClose: () => {},
    header: 'Confirm action',
    size: 'md',
    children: (
      <p style={{ margin: 0 }}>
        Dialog body content goes here. Use this wrapper instead of
        PrimeReact&apos;s Dialog so size, modality, and dismiss behaviour stay
        consistent.
      </p>
    ),
  },
}

export default meta
type Story = StoryObj<typeof Dialog>

export const Default: Story = {}

export const Small: Story = { args: { size: 'sm' } }
export const Large: Story = { args: { size: 'lg' } }
export const ExtraLarge: Story = { args: { size: 'xl' } }

export const WithFooter: Story = {
  args: {
    footer: (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button label="Cancel" className="p-button-text" />
        <Button label="Save" icon="pi pi-check" />
      </div>
    ),
  },
}

function ToggleableDialog(args: React.ComponentProps<typeof Dialog>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button label="Open dialog" onClick={() => setOpen(true)} />
      <Dialog
        {...args}
        open={open}
        onClose={() => setOpen(false)}
        header="Toggleable example"
      >
        <p style={{ margin: 0 }}>
          Click outside, press Escape, or hit the close button.
        </p>
      </Dialog>
    </>
  )
}

export const Toggleable: Story = {
  args: { open: undefined as unknown as boolean },
  render: args => <ToggleableDialog {...args} />,
}
