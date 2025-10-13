import { useState, useRef } from 'react'
import { Dialog } from 'primereact/dialog'
import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { Toast } from 'primereact/toast'
import { TextureSetDto, TextureType } from '../../../types'
import { getTextureTypeLabel } from '../../../utils/textureTypeUtils'
import './dialogs.css'

interface MergeTextureSetDialogProps {
  visible: boolean
  sourceTextureSet: TextureSetDto | null
  targetTextureSet: TextureSetDto | null
  onHide: () => void
  onMerge: (textureType: TextureType) => Promise<void>
}

function MergeTextureSetDialog({
  visible,
  sourceTextureSet,
  targetTextureSet,
  onHide,
  onMerge,
}: MergeTextureSetDialogProps) {
  const [selectedTextureType, setSelectedTextureType] = useState<TextureType | null>(null)
  const [merging, setMerging] = useState(false)
  const toast = useRef<Toast>(null)

  // Get available texture types (all types that the target set doesn't already have)
  const getAvailableTextureTypes = () => {
    if (!targetTextureSet) return []
    
    const existingTypes = targetTextureSet.textures?.map(t => t.textureType) || []
    const allTypes = [
      TextureType.Albedo,
      TextureType.Normal,
      TextureType.Height,
      TextureType.AO,
      TextureType.Roughness,
      TextureType.Metallic,
      TextureType.Diffuse,
      TextureType.Specular,
    ]
    
    return allTypes
      .filter(type => !existingTypes.includes(type))
      .map(type => ({
        label: getTextureTypeLabel(type),
        value: type,
      }))
  }

  const handleMerge = async () => {
    if (!selectedTextureType) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please select a texture type',
        life: 3000,
      })
      return
    }

    try {
      setMerging(true)
      await onMerge(selectedTextureType)
      onHide()
    } catch (error) {
      console.error('Failed to merge texture sets:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to merge texture sets',
        life: 3000,
      })
    } finally {
      setMerging(false)
    }
  }

  const availableTypes = getAvailableTextureTypes()

  const footer = (
    <div>
      <Button
        label="Cancel"
        icon="pi pi-times"
        onClick={onHide}
        className="p-button-text"
        disabled={merging}
      />
      <Button
        label="Merge"
        icon="pi pi-check"
        onClick={handleMerge}
        disabled={!selectedTextureType || merging}
        loading={merging}
      />
    </div>
  )

  return (
    <>
      <Toast ref={toast} />
      <Dialog
        header="Merge Texture Sets"
        visible={visible}
        style={{ width: '500px' }}
        footer={footer}
        onHide={onHide}
        modal
      >
        <div className="merge-texture-set-dialog">
          {sourceTextureSet && targetTextureSet && (
            <>
              <div className="merge-info">
                <p>
                  You are merging the <strong>Albedo</strong> texture from{' '}
                  <strong>"{sourceTextureSet.name}"</strong> into{' '}
                  <strong>"{targetTextureSet.name}"</strong>.
                </p>
                <p>Select which texture type to add it as:</p>
              </div>

              <div className="field">
                <label htmlFor="textureType">Texture Type</label>
                <Dropdown
                  id="textureType"
                  value={selectedTextureType}
                  options={availableTypes}
                  onChange={e => setSelectedTextureType(e.value)}
                  placeholder="Select a texture type"
                  disabled={merging || availableTypes.length === 0}
                  className="w-full"
                />
              </div>

              {availableTypes.length === 0 && (
                <div className="no-available-types">
                  <i className="pi pi-info-circle" />
                  <p>
                    The target texture set already has all texture types filled.
                    Please remove a texture from the target set first.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}

export default MergeTextureSetDialog
