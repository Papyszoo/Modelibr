import { useModelHierarchy } from '@/features/model-viewer/hooks/useModelHierarchy'
import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'
import { type Model } from '@/utils/fileUtils'

import { MaterialsPanel } from './MaterialsPanel'
import { ModelHierarchy } from './ModelHierarchy'
import { ModelInfoSidebar } from './ModelInfoSidebar'
import { ThumbnailSidebar } from './ThumbnailSidebar'
import { UVMapScene } from './UVMapScene'
import { type PanelContent } from './ViewerMenubar'

interface ViewerSidePanelProps {
  content: PanelContent
  model: Model | null
  modelVersionId: number | null
  selectedVersion: {
    id: number
    defaultTextureSetId?: number
    materialNames?: string[]
    variantNames?: string[]
    mainVariantName?: string
    textureMappings?: Array<{
      materialName: string
      textureSetId: number
      variantName: string
    }>
  } | null
  selectedTextureSetId: number | null
  onTextureSetSelect: (textureSetId: number | null) => void
  onModelUpdated: () => void
  onRegenerate: () => void
  onVariantChange?: (variantName: string) => void
}

export function ViewerSidePanel({
  content,
  model,
  modelVersionId,
  selectedVersion,
  selectedTextureSetId,
  onTextureSetSelect,
  onModelUpdated,
  onRegenerate,
  onVariantChange,
}: ViewerSidePanelProps) {
  const { modelObject } = useModelObject()
  const hierarchy = useModelHierarchy(modelObject)

  if (!content) return null

  switch (content) {
    case 'hierarchy':
      return <ModelHierarchy hierarchy={hierarchy} />
    case 'materials':
      return (
        <MaterialsPanel
          modelId={model?.id ?? null}
          modelVersionId={modelVersionId}
          selectedVersion={selectedVersion}
          selectedTextureSetId={selectedTextureSetId}
          onTextureSetSelect={onTextureSetSelect}
          onModelUpdated={onModelUpdated}
          onVariantChange={onVariantChange}
        />
      )
    case 'modelInfo':
      return model ? (
        <ModelInfoSidebar model={model} onModelUpdated={onModelUpdated} />
      ) : null
    case 'uvMap':
      return <UVMapScene />
    case 'thumbnail':
      return model ? (
        <ThumbnailSidebar model={model} onRegenerate={onRegenerate} />
      ) : null
    default:
      return null
  }
}
