import { useState } from 'react'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { classNames } from 'primereact/utils'
import { TexturePackDto } from '../../../types'

interface PackHeaderProps {
  texturePack: TexturePackDto
  onNameUpdate: (newName: string) => Promise<void>
  updating: boolean
}

export default function PackHeader({
  texturePack,
  onNameUpdate,
  updating,
}: PackHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [editedName, setEditedName] = useState(texturePack.name)
  const [errors, setErrors] = useState<{ name?: string }>({})

  const validateName = (name: string) => {
    const newErrors: { name?: string } = {}

    if (!name.trim()) {
      newErrors.name = 'Name is required'
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters long'
    } else if (name.trim().length > 200) {
      newErrors.name = 'Name cannot exceed 200 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleUpdateName = async () => {
    if (!validateName(editedName)) {
      return
    }

    try {
      await onNameUpdate(editedName.trim())
      setEditing(false)
    } catch {
      // Error handling is done in parent component
    }
  }

  const handleCancelEdit = () => {
    setEditedName(texturePack.name)
    setEditing(false)
    setErrors({})
  }

  return (
    <div className="pack-name-section">
      {editing ? (
        <div className="p-inputgroup">
          <InputText
            value={editedName}
            onChange={e => setEditedName(e.target.value)}
            className={classNames({ 'p-invalid': errors.name })}
            placeholder="Texture pack name"
            maxLength={200}
            autoFocus
          />
          <Button
            icon="pi pi-check"
            className="p-button-success"
            onClick={handleUpdateName}
            loading={updating}
            disabled={!editedName.trim() || updating}
          />
          <Button
            icon="pi pi-times"
            className="p-button-secondary"
            onClick={handleCancelEdit}
            disabled={updating}
          />
        </div>
      ) : (
        <div className="pack-name-display">
          <h3>{texturePack.name}</h3>
          <Button
            icon="pi pi-pencil"
            className="p-button-text p-button-sm"
            onClick={() => setEditing(true)}
            tooltip="Edit name"
          />
        </div>
      )}
      {errors.name && <small className="p-error">{errors.name}</small>}
    </div>
  )
}
