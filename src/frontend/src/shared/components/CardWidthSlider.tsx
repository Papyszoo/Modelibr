import { Slider } from 'primereact/slider'
import './CardWidthSlider.css'

interface CardWidthSliderProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

export default function CardWidthSlider({
  value,
  min,
  max,
  onChange,
}: CardWidthSliderProps) {
  return (
    <div className="card-width-slider-container">
      <div className="card-width-slider-label">
        <i className="pi pi-th-large" />
        <span>Card Width</span>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={10}
        onChange={e => onChange(e.value as number)}
        className="card-width-slider"
      />
      <span className="card-width-value">{value}px</span>
    </div>
  )
}
