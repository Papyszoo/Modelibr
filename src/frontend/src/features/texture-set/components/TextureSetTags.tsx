import './TextureSetTags.css'

import { Button } from 'primereact/button'
import { Chip } from 'primereact/chip'
import { useEffect, useState } from 'react'

import { TagInput } from '@/shared/components/tags/TagInput'
import { useTagVocabulary } from '@/shared/hooks/useTagVocabulary'

interface TextureSetTagsProps {
  tags: string[]
  onTagsUpdate: (tags: string[]) => Promise<void>
}

/**
 * Tag display + inline editor for a texture set, drawing suggestions from the
 * shared tag vocabulary and persisting via the shared TagInput primitive.
 */
export function TextureSetTags({ tags, onTagsUpdate }: TextureSetTagsProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>(tags)
  const [saving, setSaving] = useState(false)
  const vocabulary = useTagVocabulary()

  useEffect(() => {
    setDraft(tags)
  }, [tags])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onTagsUpdate(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="texture-set-tags" data-testid="texture-set-tags">
        <div className="texture-set-tags-display">
          {tags.length > 0 ? (
            tags.map(tag => <Chip key={tag} label={tag} />)
          ) : (
            <span className="texture-set-tags-empty">No tags</span>
          )}
          <Button
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            aria-label="Edit tags"
            tooltip="Edit tags"
            onClick={() => setEditing(true)}
            data-testid="texture-set-tags-edit"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="texture-set-tags" data-testid="texture-set-tags">
      <TagInput
        value={draft}
        onChange={setDraft}
        suggestions={vocabulary.data ?? []}
        placeholder="Add a tag and press Enter"
        inputTestId="texture-set-tags-input"
      />
      <div className="texture-set-tags-actions">
        <Button
          label="Cancel"
          text
          size="small"
          disabled={saving}
          onClick={() => {
            setDraft(tags)
            setEditing(false)
          }}
        />
        <Button
          label="Save tags"
          icon="pi pi-check"
          size="small"
          loading={saving}
          onClick={handleSave}
          data-testid="texture-set-tags-save"
        />
      </div>
    </div>
  )
}
