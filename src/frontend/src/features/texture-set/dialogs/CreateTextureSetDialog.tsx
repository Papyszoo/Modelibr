import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { SelectButton } from 'primereact/selectbutton'
import { classNames } from 'primereact/utils'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { textureSetNameFormSchema } from '@/shared/validation/formSchemas'
import { TextureSetKind } from '@/types'

type TextureSetNameFormValues = {
  name: string
}

interface CreateTextureSetDialogProps {
  visible: boolean
  onHide: () => void
  onSubmit: (name: string, kind: TextureSetKind) => Promise<void>
  /**
   * When set, the kind is fixed to this value and the kind selector is hidden.
   * Used by the Materials panel "Add new texture set" flow which always
   * creates ModelOwned texture sets.
   */
  lockedKind?: TextureSetKind
  /** Optional header override; defaults to "Create Texture Set". */
  header?: string
}

export function CreateTextureSetDialog({
  visible,
  onHide,
  onSubmit,
  lockedKind,
  header,
}: CreateTextureSetDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [kind, setKind] = useState<TextureSetKind>(
    lockedKind ?? TextureSetKind.ModelSpecific
  )

  const kindOptions = [
    { label: 'Multi-Model', value: TextureSetKind.ModelSpecific },
    { label: 'Universal (Tileable)', value: TextureSetKind.Universal },
  ]

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
      name: '',
    },
  })

  const nameValue = watch('name') || ''

  useEffect(() => {
    if (!visible) {
      reset({ name: '' })
      setKind(lockedKind ?? TextureSetKind.ModelSpecific)
    }
  }, [visible, reset, lockedKind])

  const handleValidSubmit = async (values: TextureSetNameFormValues) => {
    try {
      setSubmitting(true)
      await onSubmit(values.name, kind)
      reset({ name: '' })
    } catch (error) {
      console.error('Failed to create texture set:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    reset({ name: '' })
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
        onClick={handleSubmit(handleValidSubmit)}
        loading={submitting}
        disabled={!nameValue.trim() || submitting}
      />
    </div>
  )

  return (
    <Dialog
      header={header ?? 'Create Texture Set'}
      visible={visible}
      onHide={handleCancel}
      footer={dialogFooter}
      modal
      className="p-fluid"
      style={{ width: '450px' }}
      blockScroll
    >
      <div className="p-field">
        <label htmlFor="set-name" className="p-text-bold">
          Name <span className="p-error">*</span>
        </label>
        <InputText
          id="set-name"
          {...register('name')}
          className={classNames({ 'p-invalid': errors.name })}
          placeholder="Enter texture set name"
          maxLength={200}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && nameValue.trim() && !submitting) {
              void handleSubmit(handleValidSubmit)()
            }
          }}
        />
        {errors.name && (
          <small className="p-error">{errors.name.message}</small>
        )}
        <small className="p-text-secondary">
          Choose a descriptive name for your texture set (2-200 characters)
        </small>
      </div>

      {lockedKind === undefined && (
        <div className="p-field" style={{ marginTop: '1rem' }}>
          <label className="p-text-bold">Type</label>
          <SelectButton
            value={kind}
            options={kindOptions}
            onChange={e => {
              if (e.value !== null && e.value !== undefined) setKind(e.value)
            }}
            style={{ marginTop: '0.5rem' }}
          />
          <small className="p-text-secondary">
            {kind === TextureSetKind.ModelSpecific
              ? "Baked textures tied to a specific model's UV layout"
              : 'Tileable/seamless textures for surfaces (walls, floors, terrain)'}
          </small>
        </div>
      )}
    </Dialog>
  )
}
