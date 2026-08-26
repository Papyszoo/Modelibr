import './TagInput.css'

import { Button } from 'primereact/button'
import { Chip } from 'primereact/chip'
import { InputText } from 'primereact/inputtext'
import { useMemo, useState } from 'react'

function normalizeTagKey(value: string): string {
  return value.trim().toLowerCase()
}

function splitTagInput(value: string): string[] {
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
}

export interface TagInputProps {
  /** Currently selected tags (controlled). */
  value: string[]
  onChange: (tags: string[]) => void
  /** Known tags from the shared vocabulary, offered as suggestions. */
  suggestions?: string[]
  placeholder?: string
  maxSuggestions?: number
  inputTestId?: string
  /**
   * A closed-ish vocabulary. When given, only these values may be added unless
   * `allowCustom` says otherwise, and every one of them is offered rather than
   * the first `maxSuggestions` - a vocabulary the user cannot see all of is one
   * they will type a near-miss into.
   *
   * Distinct from `suggestions`, which is an open list of what other people have
   * typed. Both can be present; `options` is the one that constrains.
   */
  options?: string[]
  /**
   * Whether a value outside `options` may be added. True when no options are
   * given, because that is the free-text tag editor this component has always
   * been. False makes the picker closed.
   */
  allowCustom?: boolean
  /**
   * Called instead of `onChange` when a value outside `options` is added, so the
   * caller can persist it to the vocabulary first and come back with a real
   * option. Only reached when `allowCustom` is true.
   */
  onCreateOption?: (name: string) => void
  /** Heading over the suggestion list. Defaults to the tag wording. */
  suggestionsLabel?: string
}

/**
 * Dumb, composable tag editor: a chip list plus a text input with comma/Enter
 * tokenization and suggestions from a shared vocabulary. Holds no server state
 * and knows nothing about asset types - props in, `onChange` out.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Type a tag and press Enter',
  maxSuggestions = 8,
  inputTestId,
  options,
  allowCustom = options === undefined,
  onCreateOption,
  suggestionsLabel,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const availableSuggestions = useMemo(() => {
    const selectedKeys = new Set(value.map(normalizeTagKey))
    const query = normalizeTagKey(inputValue)
    // A closed vocabulary shows all of itself. Truncating it to eight would leave
    // the user typing a near-miss for an option that exists three rows down.
    const pool = options ?? suggestions
    const limit = options ? pool.length : maxSuggestions

    return pool
      .filter(name => !selectedKeys.has(normalizeTagKey(name)))
      .filter(name => !query || normalizeTagKey(name).includes(query))
      .slice(0, limit)
  }, [options, suggestions, inputValue, value, maxSuggestions])

  const addTags = (rawValue: string) => {
    const candidates = splitTagInput(rawValue)
    if (candidates.length === 0) {
      return
    }

    const known = options
      ? new Map(options.map(name => [normalizeTagKey(name), name]))
      : null
    const seen = new Set(value.map(normalizeTagKey))
    const next = [...value]

    for (const candidate of candidates) {
      const normalized = normalizeTagKey(candidate)
      if (!normalized || seen.has(normalized)) {
        continue
      }

      const match = known?.get(normalized)

      if (known && match === undefined) {
        // Outside the vocabulary. The caller either creates it - and comes back
        // with a real option - or the value is refused. Silently accepting it
        // would put a value in the field that the server has no id for.
        if (allowCustom) {
          onCreateOption?.(candidate)
        }
        continue
      }

      seen.add(normalized)
      // Stored under the vocabulary's own spelling, so "low poly" and "Low Poly"
      // do not become two different answers to one question.
      next.push(match ?? candidate)
    }

    onChange(next)
    setInputValue('')
  }

  const removeTag = (tagToRemove: string) => {
    const tagKey = normalizeTagKey(tagToRemove)
    onChange(value.filter(tag => normalizeTagKey(tag) !== tagKey))
  }

  return (
    <div className="tag-input">
      <div className="tag-input-row">
        <InputText
          value={inputValue}
          onChange={event => setInputValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              addTags(inputValue)
            }
          }}
          placeholder={placeholder}
          className="tag-input-field"
          data-testid={inputTestId}
        />
        <Button
          label="Add"
          icon="pi pi-plus"
          onClick={() => addTags(inputValue)}
          disabled={!inputValue.trim()}
        />
      </div>

      {value.length > 0 ? (
        <div className="tag-input-chips">
          {value.map(tag => (
            <Chip
              key={tag}
              label={tag}
              removable
              onRemove={() => removeTag(tag)}
            />
          ))}
        </div>
      ) : null}

      {availableSuggestions.length > 0 ? (
        <div className="tag-input-suggestions">
          <span className="tag-input-suggestions-label">
            {suggestionsLabel ?? 'Existing tags'}
          </span>
          <div className="tag-input-suggestions-list">
            {availableSuggestions.map(tag => (
              <Button
                key={tag}
                label={tag}
                text
                size="small"
                onClick={() => addTags(tag)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
