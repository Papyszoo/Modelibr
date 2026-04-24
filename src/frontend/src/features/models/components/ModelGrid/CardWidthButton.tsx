import './CardWidthButton.css'

import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { Slider } from 'primereact/slider'
import { useRef } from 'react'

import { useIsMobile } from '@/shared/hooks'

interface CardWidthButtonProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

export function CardWidthButton({
  value,
  min,
  max,
  onChange,
}: CardWidthButtonProps) {
  const overlayRef = useRef<OverlayPanel>(null)
  const isMobile = useIsMobile()

  return (
    <>
      <Button
        icon="pi pi-th-large"
        label="Card Width"
        className="p-button-text p-button-sm card-width-toggle-btn"
        // Skip tooltip on touch — it lingers on top of the slider popover
        // because there's no hover-out event to dismiss it.
        tooltip={isMobile ? undefined : 'Card Width'}
        tooltipOptions={{ position: 'bottom' }}
        onClick={e => overlayRef.current?.toggle(e)}
        aria-label="Card Width"
      />
      <OverlayPanel
        ref={overlayRef}
        className={`card-width-overlay${isMobile ? ' card-width-overlay--mobile' : ''}`}
      >
        <div className="card-width-overlay-content">
          <div className="card-width-overlay-label">
            <i className="pi pi-th-large" />
            <span>Card Width</span>
          </div>
          <Slider
            value={value}
            min={min}
            max={max}
            step={10}
            onChange={e => onChange(e.value as number)}
            className="card-width-overlay-slider"
          />
        </div>
      </OverlayPanel>
    </>
  )
}
