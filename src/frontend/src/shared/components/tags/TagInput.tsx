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
}

/**
 * Dumb, composable tag editor: a chip list plus a text input with comma/Enter
 * tokenization and suggestions from a shared vocabulary. Holds no server state
 * and knows nothing about asset types — props in, `onChange` out.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Type a tag and press Enter',
  maxSuggestions = 8,
  inputTestId,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const availableSuggestions = useMemo(() => {
    const selectedKeys = new Set(value.map(normalizeTagKey))
    const query = normalizeTagKey(inputValue)
    return suggestions
      .filter(name => !selectedKeys.has(normalizeTagKey(name)))
      .filter(name => !query || normalizeTagKey(name).includes(query))
      .slice(0, maxSuggestions)
  }, [suggestions, inputValue, value, maxSuggestions])

  const addTags = (rawValue: string) => {
    const candidates = splitTagInput(rawValue)
    if (candidates.length === 0) {
      return
    }

    const seen = new Set(value.map(normalizeTagKey))
    const next = [...value]
    for (const candidate of candidates) {
      const normalized = normalizeTagKey(candidate)
      if (!normalized || seen.has(normalized)) {
        continue
      }
      seen.add(normalized)
      next.push(candidate)
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
          <span className="tag-input-suggestions-label">Existing tags</span>
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
