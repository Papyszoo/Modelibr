import { type JSX } from 'react'

interface ThumbnailBackgroundFieldProps {
  /** 'transparent' or a #RRGGBB colour. */
  background: string
  saving?: boolean
  onChange: (value: string) => void
}

const DEFAULT_COLOUR = '#ffffff'

/**
 * Thumbnail background: transparent, or a solid colour picked with the native
 * colour input. Saves immediately on change.
 */
export function ThumbnailBackgroundField({
  background,
  saving,
  onChange,
}: ThumbnailBackgroundFieldProps): JSX.Element {
  const isTransparent = background === 'transparent'
  const colour = isTransparent ? DEFAULT_COLOUR : background

  return (
    <div className="settings-field">
      <label htmlFor="thumbnailBackgroundColour">Thumbnail background</label>
      <div className="thumbnail-background-row">
        <label className="settings-checkbox-label">
          <input
            id="transparentThumbnailBackground"
            type="checkbox"
            checked={isTransparent}
            disabled={saving}
            onChange={event =>
              onChange(event.target.checked ? 'transparent' : colour)
            }
          />
          <span>Transparent</span>
        </label>
        {!isTransparent && (
          <input
            id="thumbnailBackgroundColour"
            type="color"
            aria-label="Thumbnail background colour"
            value={colour}
            disabled={saving}
            onChange={event => onChange(event.target.value)}
          />
        )}
      </div>
      <span className="settings-help">
        Behind rendered thumbnails. Regenerate existing thumbnails to apply a
        change.
      </span>
    </div>
  )
}
