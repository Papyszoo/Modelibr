import { Button } from 'primereact/button'

interface TextureSetListHeaderProps {
  setCount: number
  onCreateSet: () => void
}

export default function TextureSetListHeader({
  setCount,
  onCreateSet,
}: TextureSetListHeaderProps) {
  return (
    <header className="texture-set-list-header">
      <div className="header-content">
        <h1>Texture Sets</h1>
        <div className="texture-set-stats">
          <span className="stat-item">
            <i className="pi pi-palette"></i>
            {setCount} set{setCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <Button
        label="Create Set"
        icon="pi pi-plus"
        onClick={onCreateSet}
        className="p-button-primary"
      />
    </header>
  )
}
