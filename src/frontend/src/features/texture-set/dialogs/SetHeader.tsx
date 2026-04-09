import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { classNames } from 'primereact/utils'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { textureSetNameFormSchema } from '@/shared/validation/formSchemas'
import { type TextureSetDto } from '@/types'

type TextureSetNameFormValues = {
  name: string
}

interface SetHeaderProps {
  textureSet: TextureSetDto
  onNameUpdate: (newName: string) => Promise<void>
  updating: boolean
}

export function SetHeader({
  textureSet,
  onNameUpdate,
  updating,
}: SetHeaderProps) {
  const [editing, setEditing] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<TextureSetNameFormValues>({
    resolver: zodResolver(textureSetNameFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: textureSet.name,
    },
  })

  const editedName = watch('name') || ''

  useEffect(() => {
    if (!editing) {
      reset({ name: textureSet.name })
    }
  }, [editing, textureSet.name, reset])

  const handleUpdateName = async (values: TextureSetNameFormValues) => {
    try {
      await onNameUpdate(values.name)
      setEditing(false)
    } catch {
      // Error handling is done in parent component
    }
  }

  const handleCancelEdit = () => {
    reset({ name: textureSet.name })
    setEditing(false)
  }

  return (
    <div className="set-name-section">
      {editing ? (
        <div className="p-inputgroup">
          <InputText
            {...register('name')}
            className={classNames({ 'p-invalid': errors.name })}
            placeholder="Texture set name"
            maxLength={200}
            autoFocus
          />
          <Button
            icon="pi pi-check"
            className="p-button-success"
            onClick={handleSubmit(handleUpdateName)}
            loading={updating}
            disabled={!editedName.trim() || updating}
            aria-label="Save texture set name"
          />
          <Button
            icon="pi pi-times"
            className="p-button-secondary"
            onClick={handleCancelEdit}
            disabled={updating}
            aria-label="Cancel texture set name edit"
          />
        </div>
      ) : (
        <div className="set-name-display">
          <h3>{textureSet.name}</h3>
          <Button
            icon="pi pi-pencil"
            className="p-button-text p-button-sm"
            onClick={() => setEditing(true)}
            tooltip="Edit name"
            aria-label="Edit texture set name"
          />
        </div>
      )}
      {errors.name && <small className="p-error">{errors.name.message}</small>}
    </div>
  )
}
