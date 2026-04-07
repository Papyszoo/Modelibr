import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  type ModelCategoryDto,
  type ModelTagDto,
  type PackDto,
  type ProjectDto,
} from '@/types'

import { ModelsFilters } from './ModelsFilters'

const noop = () => {}

const mockPacks: PackDto[] = [
  {
    id: 1,
    name: 'Fantasy Pack',
    description: 'Fantasy themed assets',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    modelCount: 5,
    textureSetCount: 0,
    spriteCount: 0,
    soundCount: 0,
    isEmpty: false,
    models: [],
    textureSets: [],
    sprites: [],
  },
  {
    id: 2,
    name: 'Sci-Fi Pack',
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2025-02-01T00:00:00Z',
    modelCount: 3,
    textureSetCount: 0,
    spriteCount: 0,
    soundCount: 0,
    isEmpty: false,
    models: [],
    textureSets: [],
    sprites: [],
  },
]

const mockProjects: ProjectDto[] = [
  {
    id: 1,
    name: 'Main Game',
    description: 'The main game project',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    modelCount: 10,
    textureSetCount: 0,
    spriteCount: 0,
    soundCount: 0,
    isEmpty: false,
    models: [],
    textureSets: [],
    sprites: [],
  },
]

const mockCategories: ModelCategoryDto[] = [
  {
    id: 1,
    name: 'Characters',
    path: 'Characters',
    parentId: null,
  },
  {
    id: 2,
    name: 'Humanoid',
    path: 'Characters / Humanoid',
    parentId: 1,
  },
]

const mockTags: ModelTagDto[] = [
  { name: 'character' },
  { name: 'fantasy' },
  { name: 'environment' },
]

const meta: Meta<typeof ModelsFilters> = {
  title: 'Models/ModelsFilters',
  component: ModelsFilters,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    searchQuery: '',
    onSearchChange: noop,
    packs: mockPacks,
    projects: mockProjects,
    categories: mockCategories,
    tags: mockTags,
    selectedPackIds: [],
    selectedProjectIds: [],
    selectedCategoryKeys: {},
    selectedCategoryIds: [],
    selectedTagNames: [],
    hasConceptImages: false,
    onPackFilterChange: noop,
    onProjectFilterChange: noop,
    onCategoryChange: noop,
    onTagChange: noop,
    onHasConceptImagesChange: noop,
    cardWidth: 200,
    onCardWidthChange: noop,
    modelCount: 12,
    selectedModelCount: 0,
    onUploadClick: noop,
    onRefreshClick: noop,
    onBulkActionsClick: noop,
  },
}

export default meta
type Story = StoryObj<typeof ModelsFilters>

export const Default: Story = {}

export const WithSearchQuery: Story = {
  args: {
    searchQuery: 'sword',
  },
}

export const WithActiveFilters: Story = {
  args: {
    selectedPackIds: [1],
    selectedProjectIds: [1],
    selectedTagNames: ['character'],
  },
}

export const NoPacksOrProjects: Story = {
  args: {
    packs: [],
    projects: [],
  },
}

export const FiltersDisabled: Story = {
  args: {
    selectedPackIds: [1],
    packFilterDisabled: true,
    projectFilterDisabled: true,
  },
}
