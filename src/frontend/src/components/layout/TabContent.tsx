import { ModelList } from '../../features/models'
import ModelViewer from '../../ModelViewer'
import TextureList from '../tabs/TextureList'
import { TexturePackList, TexturePackViewer } from '../../features/texture-pack'
import AnimationList from '../tabs/AnimationList'
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

      case 'texture':
        return <TextureList />

      case 'texturePacks':
        return <TexturePackList />

      case 'texturePackViewer':
        if (!tab.packId) {
          return (
            <div className="tab-error">
              <h3>Texture pack data not available</h3>
              <p>The texture pack information could not be loaded.</p>
            </div>
          )
        }
        return <TexturePackViewer packId={tab.packId} />

      case 'animation':
        return <AnimationList />

      case 'settings':
        return <Settings />

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
