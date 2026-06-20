import './SearchPalette.css'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useDebouncedValue } from '@/shared/hooks'

import { globalSearch } from '../api/searchApi'
import { type SearchResultItem, type SearchResultType } from '../types'

const TYPE_META: Record<SearchResultType, { label: string; icon: string }> = {
  model: { label: 'Models', icon: 'pi pi-box' },
  textureSet: { label: 'Texture Sets', icon: 'pi pi-images' },
  environmentMap: { label: 'Environment Maps', icon: 'pi pi-globe' },
  sprite: { label: 'Sprites', icon: 'pi pi-th-large' },
  sound: { label: 'Sounds', icon: 'pi pi-volume-up' },
  pack: { label: 'Packs', icon: 'pi pi-folder' },
  project: { label: 'Projects', icon: 'pi pi-briefcase' },
}

interface SearchPaletteProps {
  visible: boolean
  onClose: () => void
  onSelectResult: (item: SearchResultItem) => void
}

export function SearchPalette({
  visible,
  onClose,
  onSelectResult,
}: SearchPaletteProps) {
  const [term, setTerm] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeItemRef = useRef<HTMLButtonElement>(null)
  const debouncedTerm = useDebouncedValue(term.trim(), 250)

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debouncedTerm],
    queryFn: () => globalSearch(debouncedTerm),
    enabled: visible && debouncedTerm.length > 0,
    placeholderData: previous => previous,
  })

  const groups = useMemo(() => data?.groups ?? [], [data])

  // Flattened, ordered list of selectable items for keyboard navigation.
  const flatItems = useMemo(
    () => groups.flatMap(group => group.items),
    [groups]
  )

  // Reset when opening; focus the input.
  useEffect(() => {
    if (visible) {
      setTerm('')
      setActiveIndex(0)
      // Focus after the dialog paints.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [visible])

  // Keep the active index in range as results change.
  useEffect(() => {
    setActiveIndex(index =>
      flatItems.length === 0 ? 0 : Math.min(index, flatItems.length - 1)
    )
  }, [flatItems.length])

  // Keep the highlighted result visible as the user arrows through the list.
  // (Guarded — jsdom and a few browsers don't implement scrollIntoView.)
  useEffect(() => {
    activeItemRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex])

  if (!visible) {
    return null
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(index =>
        flatItems.length === 0 ? 0 : (index + 1) % flatItems.length
      )
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(index =>
        flatItems.length === 0
          ? 0
          : (index - 1 + flatItems.length) % flatItems.length
      )
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = flatItems[activeIndex]
      if (item) {
        onSelectResult(item)
        onClose()
      }
    }
  }

  const hasTerm = debouncedTerm.length > 0

  return (
    <div
      className="search-palette-backdrop"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="search-palette"
        role="dialog"
        aria-label="Search all assets"
        aria-modal="true"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="search-palette-input-row">
          <i className="pi pi-search search-palette-input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-palette-input"
            placeholder="Search models, textures, sounds, packs…"
            value={term}
            onChange={event => setTerm(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search query"
            aria-controls="search-palette-results"
            data-testid="search-palette-input"
          />
          {isFetching ? (
            <i className="pi pi-spin pi-spinner search-palette-spinner" />
          ) : null}
        </div>

        <div
          className="search-palette-results"
          id="search-palette-results"
          role="listbox"
        >
          {!hasTerm ? (
            <div className="search-palette-empty">
              Type to search across every asset type.
            </div>
          ) : flatItems.length === 0 && !isFetching ? (
            <div className="search-palette-empty">
              No matches for “{debouncedTerm}”.
            </div>
          ) : (
            groups.map(group => {
              const meta = TYPE_META[group.type]
              return (
                <div key={group.type} className="search-palette-group">
                  <div className="search-palette-group-header">
                    <span>{meta.label}</span>
                    {group.totalCount > group.items.length ? (
                      <span className="search-palette-group-more">
                        {group.totalCount} total
                      </span>
                    ) : null}
                  </div>
                  {group.items.map(item => {
                    const flatIndex = flatItems.indexOf(item)
                    const isActive = flatIndex === activeIndex
                    return (
                      <button
                        type="button"
                        key={`${item.type}-${item.id}`}
                        ref={isActive ? activeItemRef : undefined}
                        className={`search-palette-item${isActive ? ' is-active' : ''}`}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => {
                          onSelectResult(item)
                          onClose()
                        }}
                        data-testid="search-palette-result"
                      >
                        <i
                          className={`${meta.icon} search-palette-item-icon`}
                        />
                        <span className="search-palette-item-name">
                          {item.name}
                        </span>
                        {item.matchedOn === 'tag' ? (
                          <span className="search-palette-item-badge">tag</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        <div className="search-palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
