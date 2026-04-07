import { Button } from 'primereact/button'
import { Chip } from 'primereact/chip'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { useEffect, useMemo, useState } from 'react'

import { type ModelTagDto } from '@/types'

interface AddModelTagsDialogProps {
  visible: boolean
  availableTags: ModelTagDto[]
  selectedCount: number
  onHide: () => void
  onConfirm: (tags: string[]) => Promise<void>
}

function normalizeTagKey(value: string): string {
  return value.trim().toLowerCase()
}

function splitTagInput(value: string): string[] {
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
}

export function AddModelTagsDialog({
  visible,
  availableTags,
  selectedCount,
  onHide,
  onConfirm,
}: AddModelTagsDialogProps) {
  const [inputValue, setInputValue] = useState('')
  const [pendingTags, setPendingTags] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!visible) {
      return
    }

    setInputValue('')
    setPendingTags([])
    setIsSaving(false)
  }, [visible])

  const selectedCountLabel = `${selectedCount} model${selectedCount === 1 ? '' : 's'}`

  const availableSuggestions = useMemo(() => {
    const selectedKeys = new Set(pendingTags.map(normalizeTagKey))
    const query = normalizeTagKey(inputValue)

    return availableTags
      .map(tag => tag.name)
      .filter(name => !selectedKeys.has(normalizeTagKey(name)))
      .filter(name => !query || normalizeTagKey(name).includes(query))
      .slice(0, 8)
  }, [availableTags, inputValue, pendingTags])

  const addTags = (rawValue: string) => {
    const candidates = splitTagInput(rawValue)
    if (candidates.length === 0) {
      return
    }

    setPendingTags(previous => {
      const seen = new Set(previous.map(normalizeTagKey))
      const next = [...previous]

      for (const candidate of candidates) {
        const normalized = normalizeTagKey(candidate)
        if (!normalized || seen.has(normalized)) {
          continue
        }

        seen.add(normalized)
        next.push(candidate)
      }

      return next
    })
    setInputValue('')
  }

  const removeTag = (tagToRemove: string) => {
    const tagKey = normalizeTagKey(tagToRemove)
    setPendingTags(previous =>
      previous.filter(tag => normalizeTagKey(tag) !== tagKey)
    )
  }

  const handleSave = async () => {
    if (pendingTags.length === 0) {
      return
    }

    setIsSaving(true)
    try {
      await onConfirm(pendingTags)
      onHide()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      header="Add Tags"
      visible={visible}
      style={{ width: '620px', maxWidth: '96vw' }}
      onHide={onHide}
    >
      <div className="model-add-tags-dialog">
        <p className="model-add-tags-description">
          Add tags to {selectedCountLabel}. Existing tags and other metadata
          will be kept.
        </p>

        <div className="model-add-tags-input-row">
          <InputText
            value={inputValue}
            onChange={event => setInputValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault()
                addTags(inputValue)
              }
            }}
            placeholder="Type a tag and press Enter"
            className="model-add-tags-input"
          />
          <Button
            label="Add"
            icon="pi pi-plus"
            onClick={() => addTags(inputValue)}
            disabled={!inputValue.trim()}
          />
        </div>

        {pendingTags.length > 0 ? (
          <div className="model-add-tags-selected">
            {pendingTags.map(tag => (
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
          <div className="model-add-tags-suggestions">
            <span className="model-add-tags-suggestions-label">
              Existing tags
            </span>
            <div className="model-add-tags-suggestions-list">
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

        <div className="model-add-tags-actions">
          <Button label="Cancel" text onClick={onHide} disabled={isSaving} />
          <Button
            label="Add Tags"
            icon="pi pi-check"
            onClick={handleSave}
            disabled={pendingTags.length === 0 || isSaving}
            loading={isSaving}
          />
        </div>
      </div>
    </Dialog>
  )
}
