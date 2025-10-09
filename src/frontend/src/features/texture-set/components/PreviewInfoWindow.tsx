import PreviewInfo from './PreviewInfo'
import FloatingWindow from '../../../components/FloatingWindow'
import { TextureSetDto } from '../../../types'

interface PreviewInfoWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  textureSet: TextureSetDto
  geometryType: string
}

function PreviewInfoWindow({
  visible,
  onClose,
  side = 'left',
  textureSet,
  geometryType,
}: PreviewInfoWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Preview Information"
      side={side}
      windowId="preview-info"
    >
      <PreviewInfo textureSet={textureSet} geometryType={geometryType} />
    </FloatingWindow>
  )
}

export default PreviewInfoWindow
