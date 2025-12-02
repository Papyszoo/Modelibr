import { ModelList } from '../../features/models'
import { ModelViewer } from '../../features/model-viewer'
import { TextureSetList, TextureSetViewer } from '../../features/texture-set'
import { PackList, PackViewer } from '../../features/pack'
import { ProjectList, ProjectViewer } from '../../features/project'
import { History } from '../../features/history'
import { StageEditor, StageList } from '../../features/stage-editor'
import { RecycledFilesList } from '../../features/recycled-files'
import Settings from '../tabs/Settings'
import { Tab } from '../../types'
import { useTabContext } from '../../hooks/useTabContext'
import './TabContent.css'

interface TabContentProps {
  tab: Tab
}

function TabContent({ tab }: TabContentProps): JSX.Element {
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
        return <PackViewer packId={parseInt(tab.packId)} />

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
        return <ProjectViewer projectId={parseInt(tab.projectId)} />

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

  return <div className="tab-content">{renderContent()}</div>
}

export default TabContent
