import { lazy, Suspense } from 'react'
import { ModelList } from '@/features/models'
import { History } from '@/features/history'
import { Settings } from '@/components/tabs/Settings'
import { Tab } from '@/types'
import { useTabContext } from '@/hooks/useTabContext'
import './TabContent.css'

const ModelViewer = lazy(() =>
  import('@/features/model-viewer').then(module => ({
    default: module.ModelViewer,
  }))
)
const TextureSetList = lazy(() =>
  import('@/features/texture-set').then(module => ({
    default: module.TextureSetList,
  }))
)
const TextureSetViewer = lazy(() =>
  import('@/features/texture-set').then(module => ({
    default: module.TextureSetViewer,
  }))
)
const PackList = lazy(() =>
  import('@/features/pack').then(module => ({
    default: module.PackList,
  }))
)
const PackViewer = lazy(() =>
  import('@/features/pack').then(module => ({
    default: module.PackViewer,
  }))
)
const ProjectList = lazy(() =>
  import('@/features/project').then(module => ({
    default: module.ProjectList,
  }))
)
const ProjectViewer = lazy(() =>
  import('@/features/project').then(module => ({
    default: module.ProjectViewer,
  }))
)
const SpriteList = lazy(() =>
  import('@/features/sprite').then(module => ({
    default: module.SpriteList,
  }))
)
const SoundList = lazy(() =>
  import('@/features/sounds').then(module => ({
    default: module.SoundList,
  }))
)
const StageList = lazy(() =>
  import('@/features/stage-editor').then(module => ({
    default: module.StageList,
  }))
)
const StageEditor = lazy(() =>
  import('@/features/stage-editor').then(module => ({
    default: module.StageEditor,
  }))
)
const RecycledFilesList = lazy(() =>
  import('@/features/recycled-files').then(module => ({
    default: module.RecycledFilesList,
  }))
)

interface TabContentProps {
  tab: Tab
}

export function TabContentLoading(): JSX.Element {
  return (
    <div className="tab-loading">
      <i className="pi pi-spin pi-spinner" aria-hidden="true" />
      <span>Loading...</span>
    </div>
  )
}

export function TabContent({ tab }: TabContentProps): JSX.Element {
  const { side } = useTabContext()

  const renderContent = (): JSX.Element => {
    switch (tab.type) {
      case 'modelList':
        return <ModelList isTabContent={true} />

      case 'modelViewer':
        if (!tab.modelId) {
          return (
            <div className="tab-error">
              <h3>Model data not available</h3>
              <p>The model information could not be loaded.</p>
            </div>
          )
        }
        return <ModelViewer modelId={tab.modelId} side={side} />

      case 'textureSets':
        return <TextureSetList />

      case 'textureSetViewer':
        if (!tab.setId) {
          return (
            <div className="tab-error">
              <h3>Texture set data not available</h3>
              <p>The texture set information could not be loaded.</p>
            </div>
          )
        }
        return <TextureSetViewer setId={tab.setId} side={side} />

      case 'packs':
        return <PackList />

      case 'packViewer':
        if (!tab.packId) {
          return (
            <div className="tab-error">
              <h3>Pack data not available</h3>
              <p>The pack information could not be loaded.</p>
            </div>
          )
        }
        return <PackViewer packId={parseInt(tab.packId)} tabId={tab.id} />

      case 'projects':
        return <ProjectList />

      case 'projectViewer':
        if (!tab.projectId) {
          return (
            <div className="tab-error">
              <h3>Project data not available</h3>
              <p>The project information could not be loaded.</p>
            </div>
          )
        }
        return (
          <ProjectViewer projectId={parseInt(tab.projectId)} tabId={tab.id} />
        )

      case 'sprites':
        return <SpriteList />

      case 'sounds':
        return <SoundList />

      case 'stageList':
        return <StageList />

      case 'stageEditor':
        return <StageEditor stageId={tab.stageId} />

      case 'settings':
        return <Settings />

      case 'history':
        return <History />

      case 'recycledFiles':
        return <RecycledFilesList />

      default:
        return (
          <div className="tab-error">
            <h3>Unknown tab type</h3>
            <p>Tab type "{tab.type}" is not supported.</p>
          </div>
        )
    }
  }

  return (
    <div className="tab-content">
      <Suspense fallback={<TabContentLoading />}>{renderContent()}</Suspense>
    </div>
  )
}
