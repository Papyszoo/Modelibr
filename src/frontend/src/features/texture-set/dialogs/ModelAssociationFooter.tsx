import { Button } from 'primereact/button'

interface ModelAssociationFooterProps {
  onCancel: () => void
  onSave: () => void
  saving: boolean
  hasChanges: boolean
}

export function ModelAssociationFooter({
  onCancel,
  onSave,
  saving,
  hasChanges,
}: ModelAssociationFooterProps) {
  return (
    <div>
      <Button
        label="Cancel"
        icon="pi pi-times"
        className="p-button-text"
        onClick={onCancel}
        disabled={saving}
      />
      <Button
        label="Save Changes"
        icon="pi pi-check"
        onClick={onSave}
        loading={saving}
        disabled={!hasChanges || saving}
      />
    </div>
  )
}
