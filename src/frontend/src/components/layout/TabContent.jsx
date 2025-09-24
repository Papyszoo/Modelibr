import ModelList from '../../ModelList'
import ModelViewer from '../../ModelViewer'
import TextureList from '../tabs/TextureList'
import AnimationList from '../tabs/AnimationList'
import './TabContent.css'

function TabContent({ tab }) {
  const renderContent = () => {
    switch (tab.type) {
      case 'modelList':
        return <ModelList isTabContent={true} />
      
      case 'modelDetails':
        if (!tab.data) {
          return (
            <div className="tab-error">
              <h3>Model data not available</h3>
              <p>The model information could not be loaded.</p>
            </div>
          )
        }
        return <ModelViewer model={tab.data} isTabContent={true} />
      
      case 'textureList':
        return <TextureList />
      
      case 'animationList':
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