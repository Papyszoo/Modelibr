import { useState } from 'react'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { classNames } from 'primereact/utils'

interface CreateTexturePackDialogProps {
  visible: boolean
  onHide: () => void
  onSubmit: (name: string) => Promise<void>
}

function CreateTexturePackDialog({
  visible,
  onHide,
  onSubmit,
}: CreateTexturePackDialogProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ name?: string }>({})

  const validateForm = () => {
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

  const handleSubmit = async () => {
    if (!validateForm()) {
      return
    }

    try {
      setSubmitting(true)
      await onSubmit(name.trim())
      // Reset form on success
      setName('')
      setErrors({})
    } catch (error) {
      console.error('Failed to create texture pack:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    setName('')
    setErrors({})
    onHide()
  }

  const dialogFooter = (
    <div>
      <Button
        label="Cancel"
        icon="pi pi-times"
        className="p-button-text"
        onClick={handleCancel}
        disabled={submitting}
      />
      <Button
        label="Create"
        icon="pi pi-check"
        onClick={handleSubmit}
        loading={submitting}
        disabled={!name.trim() || submitting}
      />
    </div>
  )

  return (
    <Dialog
      header="Create Texture Pack"
      visible={visible}
      onHide={handleCancel}
      footer={dialogFooter}
      modal
      className="p-fluid"
      style={{ width: '450px' }}
      blockScroll
    >
      <div className="p-field">
        <label htmlFor="pack-name" className="p-text-bold">
          Name <span className="p-error">*</span>
        </label>
        <InputText
          id="pack-name"
          value={name}
          onChange={e => setName(e.target.value)}
          className={classNames({ 'p-invalid': errors.name })}
          placeholder="Enter texture pack name"
          maxLength={200}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && name.trim() && !submitting) {
              handleSubmit()
            }
          }}
        />
        {errors.name && <small className="p-error">{errors.name}</small>}
        <small className="p-text-secondary">
          Choose a descriptive name for your texture pack (2-200 characters)
        </small>
      </div>
    </Dialog>
  )
}

export default CreateTexturePackDialog
