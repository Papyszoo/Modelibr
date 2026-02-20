import { TextureSetDto, TextureSetKind } from '@/types'

interface SetStatsProps {
  textureSet: TextureSetDto
}

export function SetStats({ textureSet }: SetStatsProps) {
  return (
    <div className="set-stats">
      <span
        className={`stat-item ${textureSet.kind === TextureSetKind.Universal ? 'kind-universal' : 'kind-model-specific'}`}
      >
        <i
          className={
            textureSet.kind === TextureSetKind.Universal
              ? 'pi pi-globe'
              : 'pi pi-box'
          }
        />
        {textureSet.kind === TextureSetKind.Universal
          ? 'Universal (Tileable)'
          : 'Model-Specific'}
      </span>
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
