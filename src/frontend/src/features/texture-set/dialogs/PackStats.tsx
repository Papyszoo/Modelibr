import { TextureSetDto } from '../../../types'

interface PackStatsProps {
  textureSet: TextureSetDto
}

export default function PackStats({ textureSet }: PackStatsProps) {
  return (
    <div className="pack-stats">
      <span className="stat-item">
        <i className="pi pi-image"></i>
        {textureSet.textureCount} texture
        {textureSet.textureCount !== 1 ? 's' : ''}
      </span>
      <span className="stat-item">
        <i className="pi pi-box"></i>
        {textureSet.associatedModels.length} model
        {textureSet.associatedModels.length !== 1 ? 's' : ''}
      </span>
      <span className="stat-item">
        <i className="pi pi-calendar"></i>
        Updated {new Date(textureSet.updatedAt).toLocaleDateString()}
      </span>
    </div>
  )
}
