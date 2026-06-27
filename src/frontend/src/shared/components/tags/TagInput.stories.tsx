import { type Meta, type StoryObj } from '@storybook/react'
import { useState } from 'react'

import { TagInput } from './TagInput'

const meta: Meta<typeof TagInput> = {
  title: 'Shared/TagInput',
  component: TagInput,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof TagInput>

function Interactive(args: { suggestions?: string[]; value?: string[] }) {
  const [value, setValue] = useState<string[]>(args.value ?? [])
  return (
    <TagInput
      value={value}
      onChange={setValue}
      suggestions={args.suggestions ?? []}
    />
  )
}

export const Empty: Story = {
  render: () => (
    <Interactive suggestions={['medieval', 'sci-fi', 'stylized']} />
  ),
}

export const WithTags: Story = {
  render: () => (
    <Interactive
      value={['medieval', 'wood']}
      suggestions={['medieval', 'sci-fi', 'stylized', 'metal', 'wood']}
    />
  ),
}
