import './NewTabPage.css'

import { type JSX, useEffect, useMemo, useRef, useState } from 'react'

import { useDockContext } from '@/contexts/DockContext'
import { useTabContext } from '@/hooks/useTabContext'
import { createTab } from '@/stores/navigationStore'
import { type Tab, type TabType } from '@/types'

// ── Tile catalog ────────────────────────────────────────────────────────────
//
// Tiles surface every tab type the user can open from the New Tab page.
// Picking a tile converts the host `newTab` into that type in-place
// (or activates an existing tab of the same singleton type).
//
type TileGroup = 'assets' | 'organize' | 'system'

interface Tile {
  /** Stable key, drives React lists + tests */
  key: string
  group: TileGroup
  icon: string
  label: string
  description: string
  /** Tab type the tile resolves to when clicked */
  targetType: TabType
  /** Optional label override for the new tab (defaults to `label`) */
  targetLabel?: string
  /**
   * Disabled tiles render greyed-out and ignore clicks. Used to keep
   * incomplete features visible without letting users open them yet.
   */
  disabled?: boolean
}

const TILES: Tile[] = [
  // ── Asset Types ───────────────────────────────────────────────────────────
  {
    key: 'models',
    group: 'assets',
    icon: 'pi-box',
    label: 'Models',
    description:
      'Browse uploaded models with versions, tags, and Blender exports.',
    targetType: 'modelList',
    targetLabel: 'Models',
  },
  {
    key: 'global-materials',
    group: 'assets',
    icon: 'pi-palette',
    label: 'Global Materials',
    description: 'Reusable PBR materials shared across many models.',
    targetType: 'globalMaterials',
    targetLabel: 'Global Materials',
  },
  {
    key: 'model-textures',
    group: 'assets',
    icon: 'pi-images',
    label: 'Model Textures',
    description: 'Textures bound to a specific model and its UVs.',
    targetType: 'modelTextures',
    targetLabel: 'Model Textures',
  },
  {
    key: 'environment-maps',
    group: 'assets',
    icon: 'pi-globe',
    label: 'Environment Maps',
    description: 'HDR panoramas and six-face cube maps used for lighting.',
    targetType: 'environmentMaps',
    targetLabel: 'Environment Maps',
  },
  {
    key: 'sprites',
    group: 'assets',
    icon: 'pi-image',
    label: 'Sprites',
    description: '2D sprite sheets, atlases, and UI iconography.',
    targetType: 'sprites',
    targetLabel: 'Sprites',
  },
  {
    key: 'sounds',
    group: 'assets',
    icon: 'pi-volume-up',
    label: 'Sounds',
    description: 'WAV, OGG, and MP3 — SFX, dialogue, ambient loops.',
    targetType: 'sounds',
    targetLabel: 'Sounds',
  },
  {
    key: 'stages',
    group: 'assets',
    icon: 'pi-th-large',
    label: 'Stages',
    description: 'Scene compositions — under rework.',
    targetType: 'stageList',
    targetLabel: 'Stages',
    disabled: true,
  },

  // ── Organize ──────────────────────────────────────────────────────────────
  {
    key: 'projects',
    group: 'organize',
    icon: 'pi-briefcase',
    label: 'Projects',
    description: 'Group assets by game, scene, or contract.',
    targetType: 'projects',
    targetLabel: 'Projects',
  },
  {
    key: 'packs',
    group: 'organize',
    icon: 'pi-inbox',
    label: 'Packs',
    description: 'Curated bundles you can publish or hand off.',
    targetType: 'packs',
    targetLabel: 'Packs',
  },
  {
    key: 'history',
    group: 'organize',
    icon: 'pi-history',
    label: 'History',
    description: 'Recent uploads, renames, and version bumps.',
    targetType: 'history',
    targetLabel: 'History',
  },
  {
    key: 'recycled-files',
    group: 'organize',
    icon: 'pi-trash',
    label: 'Recycled Files',
    description: 'Restore items you deleted in the last 30 days.',
    targetType: 'recycledFiles',
    targetLabel: 'Recycled Files',
  },

  // ── System ────────────────────────────────────────────────────────────────
  {
    key: 'settings',
    group: 'system',
    icon: 'pi-cog',
    label: 'Settings',
    description: 'Storage path, appearance, WebDAV, and Blender CLI.',
    targetType: 'settings',
    targetLabel: 'Settings',
  },
]

const GROUP_LABELS: Record<TileGroup, string> = {
  assets: 'Asset Types',
  organize: 'Organize',
  system: 'System',
}

const GROUP_ORDER: TileGroup[] = ['assets', 'organize', 'system']

/**
 * Mirrors the icon mapping in DraggableTab. Used so recently-closed entries
 * pick up the same visual identity as their dock-bar tabs.
 */
const RECENT_TAB_ICON: Partial<Record<TabType, string>> = {
  newTab: 'pi-home',
  modelList: 'pi-list',
  modelViewer: 'pi-box',
  textureSets: 'pi-folder',
  globalMaterials: 'pi-palette',
  modelTextures: 'pi-images',
  textureSetViewer: 'pi-image',
  environmentMaps: 'pi-globe',
  environmentMapViewer: 'pi-globe',
  packs: 'pi-inbox',
  packViewer: 'pi-folder-open',
  projects: 'pi-briefcase',
  projectViewer: 'pi-briefcase',
  sprites: 'pi-image',
  sounds: 'pi-volume-up',
  stageList: 'pi-th-large',
  stageEditor: 'pi-th-large',
  settings: 'pi-cog',
  history: 'pi-history',
  recycledFiles: 'pi-trash',
}

function iconForTab(type: TabType): string {
  return RECENT_TAB_ICON[type] ?? 'pi-file'
}

interface NewTabPageProps {
  /** The id of the host `newTab` tab — used so we can replace ourselves */
  tabId: string
}

export function NewTabPage({ tabId }: NewTabPageProps): JSX.Element {
  const { tabs, setTabs, setActiveTab } = useTabContext()
  const { recentlyClosedTabs, removeRecentlyClosedTab } = useDockContext()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus search; bind ⌘K / Ctrl-K to refocus.
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      q
        ? TILES.filter(
            t =>
              t.label.toLowerCase().includes(q) ||
              t.description.toLowerCase().includes(q)
          )
        : TILES,
    [q]
  )

  // Recently closed: skip any tab whose type is already open in this window
  // (avoids surfacing entries that would just activate an existing tab the
  // moment they're clicked) and skip the host newTab if it accidentally got
  // recorded. Also filter by the search query.
  const recents = useMemo(() => {
    const openTypes = new Set(tabs.filter(t => t.id !== tabId).map(t => t.type))
    return recentlyClosedTabs
      .filter(t => t.type !== 'newTab' && !openTypes.has(t.type))
      .filter(t => (q ? (t.label ?? t.type).toLowerCase().includes(q) : true))
  }, [recentlyClosedTabs, tabs, tabId, q])

  const handlePick = (tile: Tile): void => {
    if (tile.disabled) return
    const existing = tabs.find(
      t => t.type === tile.targetType && t.id !== tabId
    )

    if (existing) {
      // Dedup: drop this placeholder, switch to the existing tab.
      setTabs(tabs.filter(t => t.id !== tabId))
      setActiveTab(existing.id)
      return
    }

    // Convert in place — preserve panel marker so right-panel tabs stay right.
    const created: Tab = createTab(
      tile.targetType,
      undefined,
      tile.targetLabel ?? tile.label
    )
    const host = tabs.find(t => t.id === tabId)
    const panel = host?.params?.panel
    const replacement: Tab = panel
      ? { ...created, params: { ...created.params, panel } }
      : created

    setTabs(tabs.map(t => (t.id === tabId ? replacement : t)))
    setActiveTab(replacement.id)
  }

  const handleReopenRecent = (closed: Tab): void => {
    // Mirror handlePick: replace the host newTab in place (preserving panel
    // marker) or activate an existing tab of the same type/id.
    const existing = tabs.find(
      t => t.id !== tabId && (t.id === closed.id || t.type === closed.type)
    )

    if (existing) {
      setTabs(tabs.filter(t => t.id !== tabId))
      setActiveTab(existing.id)
    } else {
      const host = tabs.find(t => t.id === tabId)
      const panel = host?.params?.panel
      const replacement: Tab = panel
        ? { ...closed, params: { ...closed.params, panel } }
        : closed
      setTabs(tabs.map(t => (t.id === tabId ? replacement : t)))
      setActiveTab(replacement.id)
    }

    removeRecentlyClosedTab(closed.id)
  }

  const handleDismissRecent = (
    closed: Tab,
    e: React.MouseEvent<HTMLButtonElement>
  ): void => {
    e.stopPropagation()
    removeRecentlyClosedTab(closed.id)
  }

  return (
    <div className="newtab-page">
      <div className="newtab-inner">
        <div className="newtab-search">
          <i className="pi pi-search" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search panels"
          />
          <span className="newtab-search-kbd" aria-hidden="true">
            ⌘K
          </span>
        </div>

        {filtered.length === 0 && recents.length === 0 ? (
          <div className="newtab-empty">
            <i className="pi pi-search" aria-hidden="true" />
            No panels match &ldquo;{query}&rdquo;.
          </div>
        ) : q ? (
          // When searching, collapse groups into a single flat grid.
          filtered.length > 0 && (
            <NewTabGrid tiles={filtered} onPick={handlePick} />
          )
        ) : (
          GROUP_ORDER.map(group => {
            const items = filtered.filter(t => t.group === group)
            if (!items.length) return null
            return (
              <section key={group} className="newtab-section">
                <h2 className="newtab-section-tag">{GROUP_LABELS[group]}</h2>
                <NewTabGrid tiles={items} onPick={handlePick} />
              </section>
            )
          })
        )}

        {recents.length > 0 && (
          <section
            className="newtab-section newtab-section--recents"
            data-testid="newtab-recents-section"
          >
            <h2 className="newtab-section-tag">Recently Closed</h2>
            <RecentlyClosedGrid
              recents={recents}
              onReopen={handleReopenRecent}
              onDismiss={handleDismissRecent}
            />
          </section>
        )}
      </div>
    </div>
  )
}

// ── Grid ────────────────────────────────────────────────────────────────────

interface NewTabGridProps {
  tiles: Tile[]
  onPick: (tile: Tile) => void
}

function NewTabGrid({ tiles, onPick }: NewTabGridProps): JSX.Element {
  return (
    <div className="newtab-grid">
      {tiles.map(tile => (
        <button
          key={tile.key}
          type="button"
          className={`newtab-tile${tile.disabled ? ' newtab-tile--disabled' : ''}`}
          onClick={() => onPick(tile)}
          disabled={tile.disabled}
          aria-disabled={tile.disabled || undefined}
          title={tile.disabled ? `${tile.label} — reworking` : tile.label}
        >
          <div className="newtab-tile-head">
            <span className="newtab-tile-icon" aria-hidden="true">
              <i className={`pi ${tile.icon}`} />
            </span>
            <h3 className="newtab-tile-title">{tile.label}</h3>
            {tile.disabled && (
              <span className="newtab-tile-soon">Reworking</span>
            )}
          </div>
          <p className="newtab-tile-desc">{tile.description}</p>
        </button>
      ))}
    </div>
  )
}

// ── Recently closed ─────────────────────────────────────────────────────────

interface RecentlyClosedGridProps {
  recents: Tab[]
  onReopen: (tab: Tab) => void
  onDismiss: (tab: Tab, e: React.MouseEvent<HTMLButtonElement>) => void
}

function RecentlyClosedGrid({
  recents,
  onReopen,
  onDismiss,
}: RecentlyClosedGridProps): JSX.Element {
  const listRef = useRef<HTMLUListElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Read the width of one entry (plus the row gap) so wheel + buttons step
  // by a consistent amount regardless of the panel size.
  const stepSize = (): number => {
    const el = listRef.current
    if (!el) return 240
    const first = el.firstElementChild as HTMLElement | null
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0
    return (first?.offsetWidth ?? 240) + gap
  }

  const updateScrollState = (): void => {
    const el = listRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }

  // Translate vertical wheel input into horizontal scroll, since the strip
  // is a single row. Trackpad horizontal gestures (deltaX dominant) are
  // intentionally passed through to the native overflow-x scroller —
  // preventDefault would otherwise eat them. Vertical wheel only intervenes
  // when the row actually has overflow to consume, so the page can still
  // scroll past the strip at either end.
  useEffect(() => {
    const el = listRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const right = e.deltaY > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth
      const left = e.deltaY < 0 && el.scrollLeft > 0
      if (!right && !left) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', updateScrollState, { passive: true })
    updateScrollState()

    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', updateScrollState)
      ro.disconnect()
    }
  }, [recents.length])

  const scrollByOne = (direction: 1 | -1): void => {
    const el = listRef.current
    if (!el) return
    el.scrollBy({ left: direction * stepSize(), behavior: 'smooth' })
  }

  return (
    <div className="newtab-recents-wrap">
      <button
        type="button"
        className="newtab-recents-scroll newtab-recents-scroll--left"
        onClick={() => scrollByOne(-1)}
        disabled={!canScrollLeft}
        aria-label="Scroll recently closed left"
        title="Scroll left"
      >
        <i className="pi pi-chevron-left" aria-hidden="true" />
      </button>
      <ul ref={listRef} className="newtab-recents" role="list">
        {recents.map(tab => (
          <li key={tab.id} className="newtab-recent">
            <button
              type="button"
              className="newtab-recent-row"
              onClick={() => onReopen(tab)}
              title={`Reopen ${tab.label ?? tab.type}`}
            >
              <span className="newtab-recent-icon" aria-hidden="true">
                <i className={`pi ${iconForTab(tab.type)}`} />
              </span>
              <span className="newtab-recent-label">
                {tab.label ?? tab.type}
              </span>
            </button>
            <button
              type="button"
              className="newtab-recent-dismiss"
              onClick={e => onDismiss(tab, e)}
              aria-label={`Remove ${tab.label ?? tab.type} from recently closed`}
              title="Remove from recently closed"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="newtab-recents-scroll newtab-recents-scroll--right"
        onClick={() => scrollByOne(1)}
        disabled={!canScrollRight}
        aria-label="Scroll recently closed right"
        title="Scroll right"
      >
        <i className="pi pi-chevron-right" aria-hidden="true" />
      </button>
    </div>
  )
}
