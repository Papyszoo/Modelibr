import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { type UseFormRegister } from 'react-hook-form'

interface SoundCategoryDialogProps {
  visible: boolean
  isEditing: boolean
  onHide: () => void
  onSave: () => void
  registerCategory: UseFormRegister<{ name: string; description: string }>
}

export function SoundCategoryDialog({
  visible,
  isEditing,
  onHide,
  onSave,
  registerCategory,
}: SoundCategoryDialogProps) {
  return (
    <Dialog
      header={isEditing ? 'Rename Category' : 'Add Category'}
      visible={visible}
      onHide={onHide}
      style={{ width: '400px' }}
      data-testid="sound-category-dialog"
      footer={
        <div>
          <Button
            label="Cancel"
            icon="pi pi-times"
            className="p-button-text"
            onClick={onHide}
            data-testid="sound-category-dialog-cancel"
          />
          <Button
            label="Save"
            icon="pi pi-check"
            onClick={onSave}
            data-testid="sound-category-dialog-save"
          />
        </div>
      }
    >
      <div className="p-fluid">
        <div className="field">
          <label htmlFor="categoryName">Name *</label>
          <InputText
            id="categoryName"
            {...registerCategory('name')}
            autoFocus
            data-testid="sound-category-name-input"
          />
        </div>
        <div className="field">
          <label htmlFor="categoryDescription">Description</label>
          <InputTextarea
            id="categoryDescription"
            {...registerCategory('description')}
            rows={3}
            data-testid="sound-category-description-input"
          />
        </div>
      </div>
    </Dialog>
  )
}
