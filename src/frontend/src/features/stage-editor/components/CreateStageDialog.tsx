import { useState } from 'react'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'

interface CreateStageDialogProps {
  visible: boolean
  onHide: () => void
  onCreate: (name: string) => void
}

function CreateStageDialog({
  visible,
  onHide,
  onCreate,
}: CreateStageDialogProps) {
  const [name, setName] = useState('')

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim())
      setName('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && name.trim()) {
      handleCreate()
    }
  }

  return (
    <Dialog
      header="Create New Stage"
      visible={visible}
      style={{ width: '400px' }}
      onHide={onHide}
      footer={
        <div>
          <Button
            label="Cancel"
            icon="pi pi-times"
            onClick={onHide}
            className="p-button-text"
          />
          <Button
            label="Create"
            icon="pi pi-check"
            onClick={handleCreate}
            disabled={!name.trim()}
          />
        </div>
      }
    >
      <div className="p-fluid">
        <div className="field">
          <label htmlFor="stage-name">Stage Name</label>
          <InputText
            id="stage-name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter stage name..."
            autoFocus
          />
        </div>
      </div>
    </Dialog>
  )
}

export default CreateStageDialog
