import { Button } from 'primereact/button'

interface AddTextureFooterProps {
  onCancel: () => void
  onSubmit: () => void
  submitting: boolean
  canSubmit: boolean
}

export default function AddTextureFooter({
  onCancel,
  onSubmit,
  submitting,
  canSubmit,
}: AddTextureFooterProps) {
  return (
    <div>
      <Button
        label="Cancel"
        icon="pi pi-times"
        className="p-button-text"
        onClick={onCancel}
        disabled={submitting}
      />
      <Button
        label="Add Texture"
        icon="pi pi-plus"
        onClick={onSubmit}
        loading={submitting}
        disabled={!canSubmit || submitting}
      />
    </div>
  )
}
