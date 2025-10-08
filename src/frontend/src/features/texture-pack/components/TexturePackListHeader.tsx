import { Button } from 'primereact/button'

interface TexturePackListHeaderProps {
  packCount: number
  onCreatePack: () => void
}

export default function TexturePackListHeader({
  packCount,
  onCreatePack,
}: TexturePackListHeaderProps) {
  return (
    <header className="texture-pack-list-header">
      <div className="header-content">
        <h1>Texture Packs</h1>
        <div className="texture-pack-stats">
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
