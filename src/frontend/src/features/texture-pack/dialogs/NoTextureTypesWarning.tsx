interface NoTextureTypesWarningProps {
  visible: boolean
}

export default function NoTextureTypesWarning({
  visible,
}: NoTextureTypesWarningProps) {
  if (!visible) return null

  return (
    <div className="p-message p-message-warn">
      <div className="p-message-wrapper">
        <div className="p-message-icon">
          <i className="pi pi-exclamation-triangle"></i>
        </div>
        <div className="p-message-text">
          This texture pack already contains all supported texture types. Remove
          existing textures to add different ones.
        </div>
      </div>
    </div>
  )
}
