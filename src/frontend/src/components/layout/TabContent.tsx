import ModelList from '../../ModelList'
import ModelViewer from '../../ModelViewer'
import TextureList from '../tabs/TextureList'
import AnimationList from '../tabs/AnimationList'
import { Tab } from '../../types'
import './TabContent.css'

interface TabContentProps {
  tab: Tab
}

function TabContent({ tab }: TabContentProps): JSX.Element {
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
        return <ModelViewer modelId={tab.modelId} isTabContent={true} />
      
      case 'texture':
        return <TextureList />
      
      case 'animation':
        return <AnimationList />
      
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
      {renderContent()}
    </div>
  )
}

export default TabContent