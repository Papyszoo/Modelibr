import { TexturePackDto } from '../../../types'

interface PackStatsProps {
  texturePack: TexturePackDto
}

export default function PackStats({ texturePack }: PackStatsProps) {
  return (
    <div className="pack-stats">
      <span className="stat-item">
        <i className="pi pi-image"></i>
        {texturePack.textureCount} texture
        {texturePack.textureCount !== 1 ? 's' : ''}
      </span>
      <span className="stat-item">
        <i className="pi pi-box"></i>
        {texturePack.associatedModels.length} model
        {texturePack.associatedModels.length !== 1 ? 's' : ''}
      </span>
      <span className="stat-item">
        <i className="pi pi-calendar"></i>
        Updated {new Date(texturePack.updatedAt).toLocaleDateString()}
      </span>
    </div>
  )
}
