import './DesignSystemGallery.css'

import { Button } from 'primereact/button'
import { useState } from 'react'

import {
  AddTile,
  AssetGrid,
  AssetTile,
  AssetTilePlaceholder,
} from '@/shared/components/asset-tile'
import { CategoryTreePanel } from '@/shared/components/categories/CategoryTreePanel'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/feedback'
import { ListHeader } from '@/shared/components/layout'
import {
  ListToolbar,
  ListToolbarActions,
  ListToolbarButton,
  ListToolbarCount,
  ListToolbarPanel,
  ListToolbarRow,
  ListToolbarSearchInput,
} from '@/shared/components/list-toolbar'
import { TagInput } from '@/shared/components/tags/TagInput'
import type { HierarchicalCategory } from '@/shared/types/categories'

/**
 * One page showing the whole design system — token vocabulary plus every
 * shared primitive in its standard state. A primitive that stops matching
 * its siblings is visible at a glance, and the storybook-visual suite
 * snapshots the family in one image (light + dark stories).
 *
 * Extend this gallery whenever a token or shared primitive is added — see
 * the `design-system` skill.
 */

const COLOR_TOKENS: { group: string; tokens: string[] }[] = [
  {
    group: 'Surfaces & borders',
    tokens: [
      '--mod-color-bg',
      '--mod-color-surface',
      '--mod-color-surface-raised',
      '--mod-color-surface-hover',
      '--mod-color-border',
      '--mod-color-border-strong',
    ],
  },
  {
    group: 'Text',
    tokens: ['--mod-color-text', '--mod-color-text-muted'],
  },
  {
    group: 'Brand & semantic',
    tokens: [
      '--mod-color-primary',
      '--mod-color-primary-hover',
      '--mod-color-danger',
      '--mod-color-danger-bg',
      '--mod-color-warning',
      '--mod-color-warning-bg',
      '--mod-color-success',
      '--mod-color-success-bg',
      '--mod-color-info',
      '--mod-color-info-bg',
    ],
  },
]

const TEXT_TOKENS: { token: string; usage: string }[] = [
  { token: '--mod-text-xs', usage: 'counts, captions, badges' },
  { token: '--mod-text-sm', usage: 'default body/UI text' },
  { token: '--mod-text-md', usage: 'inputs, emphasized body' },
  { token: '--mod-text-lg', usage: 'section/panel titles' },
  { token: '--mod-text-xl', usage: 'tab page titles' },
  { token: '--mod-text-2xl', usage: 'page title ceiling' },
]

const SPACE_TOKENS = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']
const RADIUS_TOKENS = ['sm', 'md', 'lg', 'xl', 'pill']
const SHADOW_TOKENS = ['sm', 'md', 'lg']

const SAMPLE_CATEGORIES: HierarchicalCategory[] = [
  { id: 1, name: 'Environment', path: '1' },
  { id: 2, name: 'Props', path: '2' },
  { id: 3, name: 'Rocks', parentId: 2, path: '2/3' },
  { id: 4, name: 'Characters', path: '4' },
]

const SAMPLE_CATEGORY_COUNTS = new Map<number, number>([
  [1, 12],
  [2, 8],
  [3, 5],
  [4, 3],
])

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="dsg-section">
      <h2 className="dsg-section-title">{title}</h2>
      {children}
    </section>
  )
}

function noop() {}

export function DesignSystemGallery() {
  const [search, setSearch] = useState('')
  const [tags, setTags] = useState(['stylized', 'rock'])
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(2)

  return (
    <div className="dsg">
      <Section title="Color tokens">
        <div className="dsg-color-groups">
          {COLOR_TOKENS.map(({ group, tokens }) => (
            <div key={group} className="dsg-color-group">
              <span className="dsg-label">{group}</span>
              <div className="dsg-swatches">
                {tokens.map(token => (
                  <div key={token} className="dsg-swatch">
                    <span
                      className="dsg-swatch-chip"
                      style={{ background: `var(${token})` }}
                    />
                    <code>{token}</code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="dsg-type-rows">
          {TEXT_TOKENS.map(({ token, usage }) => (
            <div key={token} className="dsg-type-row">
              <code className="dsg-type-token">{token}</code>
              <span style={{ fontSize: `var(${token})` }}>
                Clean, useful app — no fireworks
              </span>
              <span className="dsg-label">{usage}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Spacing">
        <div className="dsg-space-rows">
          {SPACE_TOKENS.map(step => (
            <div key={step} className="dsg-space-row">
              <code>--mod-space-{step}</code>
              <span
                className="dsg-space-bar"
                style={{ width: `var(--mod-space-${step})` }}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radius & shadows">
        <div className="dsg-tiles">
          {RADIUS_TOKENS.map(step => (
            <div
              key={step}
              className="dsg-tile"
              style={{ borderRadius: `var(--mod-radius-${step})` }}
            >
              <code>radius-{step}</code>
            </div>
          ))}
          {SHADOW_TOKENS.map(step => (
            <div
              key={step}
              className="dsg-tile"
              style={{ boxShadow: `var(--mod-shadow-${step})` }}
            >
              <code>shadow-{step}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="ListHeader — compact application header">
        <ListHeader
          variant="tab"
          title="Models"
          stats={[{ icon: 'pi-box', label: '128 models' }]}
          actions={<Button label="Upload" icon="pi pi-upload" size="small" />}
        />
      </Section>

      <Section title="ListToolbar">
        <ListToolbar>
          <ListToolbarRow>
            <ListToolbarActions>
              <ListToolbarButton icon="pi pi-search" label="Search" active />
              <ListToolbarButton
                icon="pi pi-filter"
                label="Filters"
                badge={2}
              />
              <ListToolbarButton icon="pi pi-refresh" ariaLabel="Refresh" />
            </ListToolbarActions>
            <ListToolbarCount count={128} unitLabel="model" />
          </ListToolbarRow>
          <ListToolbarPanel open>
            <ListToolbarSearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search models..."
            />
          </ListToolbarPanel>
        </ListToolbar>
      </Section>

      <Section title="Asset tiles — the card identity">
        <AssetGrid cardWidth={140}>
          <AssetTile
            name="rock_large.glb"
            meta="3 variants"
            media={<AssetTilePlaceholder icon="pi pi-box" />}
          />
          <AssetTile
            name="selected.glb"
            selected
            media={<AssetTilePlaceholder icon="pi pi-box" />}
          />
          <AssetTile
            name="footsteps.wav"
            meta="0:04"
            media={<AssetTilePlaceholder icon="pi pi-volume-up" />}
          />
          <AddTile label="Add" onClick={noop} />
        </AssetGrid>
      </Section>

      <Section title="Category sidebar — the categories standard">
        <div className="dsg-category-demo">
          <CategoryTreePanel
            categories={SAMPLE_CATEGORIES}
            activeCategoryId={activeCategoryId}
            dragOverCategoryId={null}
            categoryCounts={SAMPLE_CATEGORY_COUNTS}
            unassignedCount={4}
            unassignedCategoryId={-1}
            unassignedLabel="Uncategorized"
            onCategoryChange={id => setActiveCategoryId(id)}
            onCategoryDragOver={noop}
            onCategoryDragLeave={noop}
            onCategoryDrop={noop}
          />
          <div className="dsg-category-demo-content dsg-label">
            content area — sidebar sits flat on the page surface, no frame
          </div>
        </div>
      </Section>

      <Section title="Tags">
        <TagInput
          value={tags}
          onChange={setTags}
          suggestions={['stylized', 'rock', 'nature', 'scanned']}
        />
      </Section>

      <Section title="Feedback states">
        <div className="dsg-feedback-row">
          <LoadingState message="Loading models…" />
          <EmptyState
            icon="pi-box"
            title="No models yet"
            message="Drag and drop files to get started."
            variant="compact"
          />
          <ErrorState
            title="Failed to load"
            message="The server did not respond."
            onRetry={noop}
            variant="inline"
          />
        </div>
      </Section>
    </div>
  )
}
