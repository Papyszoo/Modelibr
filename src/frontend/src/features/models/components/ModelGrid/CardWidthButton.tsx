import { useRef } from 'react'
import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { Slider } from 'primereact/slider'
import './CardWidthButton.css'

interface CardWidthButtonProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

export default function CardWidthButton({
  value,
  min,
  max,
  onChange,
}: CardWidthButtonProps) {
  const overlayRef = useRef<OverlayPanel>(null)

  return (
    <>
      <Button
        icon="pi pi-th-large"
        className="p-button-text p-button-sm card-width-toggle-btn"
        tooltip="Card Width"
        tooltipOptions={{ position: 'bottom' }}
        onClick={e => overlayRef.current?.toggle(e)}
      />
      <OverlayPanel ref={overlayRef} className="card-width-overlay">
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
