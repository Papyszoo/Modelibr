import './OptionsButton.css'

import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { SelectButton } from 'primereact/selectbutton'
import { Slider } from 'primereact/slider'
import { useRef } from 'react'

import { useIsMobile } from '@/shared/hooks'
import {
  type ThumbnailAnimationMode,
  useThumbnailAnimationStore,
} from '@/stores/thumbnailAnimationStore'

interface OptionsButtonProps {
  cardWidth: number
  minCardWidth: number
  maxCardWidth: number
  onCardWidthChange: (value: number) => void
}

const ANIMATION_MODE_OPTIONS: {
  label: string
  value: ThumbnailAnimationMode
}[] = [
  { label: 'Autoplay', value: 'autoplay' },
  { label: 'On Hover', value: 'onHover' },
  { label: 'Static', value: 'static' },
]

export function OptionsButton({
  cardWidth,
  minCardWidth,
  maxCardWidth,
  onCardWidthChange,
}: OptionsButtonProps) {
  const overlayRef = useRef<OverlayPanel>(null)
  const isMobile = useIsMobile()
  const animationMode = useThumbnailAnimationStore(state => state.mode)
  const setAnimationMode = useThumbnailAnimationStore(state => state.setMode)

  return (
    <>
      <Button
        icon="pi pi-cog"
        label="Options"
        className="p-button-text p-button-sm options-toggle-btn"
        // Skip tooltip on touch — it lingers on top of the popover because
        // there's no hover-out event to dismiss it.
        tooltip={isMobile ? undefined : 'Display options'}
        tooltipOptions={{ position: 'bottom' }}
        onClick={e => overlayRef.current?.toggle(e)}
        aria-label="Display options"
      />
      <OverlayPanel
        ref={overlayRef}
        className={`options-overlay${isMobile ? ' options-overlay--mobile' : ''}`}
      >
        <div className="options-overlay-content">
          <div className="options-overlay-section">
            <div className="options-overlay-label">
              <i className="pi pi-th-large" />
              <span>Card Width</span>
            </div>
            <Slider
              value={cardWidth}
              min={minCardWidth}
              max={maxCardWidth}
              step={10}
              onChange={e => onCardWidthChange(e.value as number)}
              className="options-overlay-slider"
            />
          </div>

          <div className="options-overlay-section">
            <div className="options-overlay-label">
              <i className="pi pi-play" />
              <span>Thumbnail Animation</span>
            </div>
            <SelectButton
              value={animationMode}
              onChange={e => {
                // SelectButton emits null when the same option is clicked
                // again — ignore so the user can't accidentally unset it.
                if (e.value) {
                  setAnimationMode(e.value as ThumbnailAnimationMode)
                }
              }}
              options={ANIMATION_MODE_OPTIONS}
              className="options-overlay-mode"
              allowEmpty={false}
            />
          </div>
        </div>
      </OverlayPanel>
    </>
  )
}
