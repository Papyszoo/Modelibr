import { Button } from 'primereact/button'

interface TextureSetListHeaderProps {
  packCount: number
  onCreatePack: () => void
}

export default function TextureSetListHeader({
  packCount,
  onCreatePack,
}: TextureSetListHeaderProps) {
  return (
    <header className="texture-set-list-header">
      <div className="header-content">
        <h1>Texture Sets</h1>
        <div className="texture-set-stats">
          <span className="stat-item">
            <i className="pi pi-folder"></i>
            {packCount} pack{packCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <Button
        label="Create Pack"
        icon="pi pi-plus"
        onClick={onCreatePack}
        className="p-button-primary"
      />
    </header>
  )
}
