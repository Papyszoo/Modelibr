import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import { Controller } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { type z } from 'zod'

import { createPack } from '@/features/pack/api/packApi'
import { packCreateFormSchema } from '@/shared/validation/formSchemas'

type PackCreateFormInput = z.input<typeof packCreateFormSchema>
type PackCreateFormOutput = z.output<typeof packCreateFormSchema>

const LICENSE_OPTIONS = [
  'Royalty Free',
  'Editorial',
  'CC0',
  'CC BY',
  'CC BY-SA',
  'Custom',
].map(value => ({ label: value, value }))

interface CreatePackDialogProps {
  visible: boolean
  onHide: () => void
}

export function CreatePackDialog({ visible, onHide }: CreatePackDialogProps) {
  const queryClient = useQueryClient()
  const toast = useRef<Toast>(null)

  const { register, control, handleSubmit, reset } = useForm<
    PackCreateFormInput,
    unknown,
    PackCreateFormOutput
  >({
    resolver: zodResolver(packCreateFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      licenseType: '',
      url: '',
    },
  })

  const createPackMutation = useMutation({
    mutationFn: (payload: {
      name: string
      description?: string
      licenseType?: string
      url?: string
    }) => createPack(payload),
    onSuccess: async () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Pack created successfully',
        life: 3000,
      })

      reset({ name: '', description: '', licenseType: '', url: '' })
      onHide()
      await queryClient.invalidateQueries({ queryKey: ['packs'] })
    },
    onError: error => {
      console.error('Failed to create pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create pack',
        life: 3000,
      })
    },
  })

  const handleCreatePack = handleSubmit(
    async values => {
      await createPackMutation.mutateAsync(values)
    },
    () => {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validation Error',
        detail: 'Pack name is required',
        life: 3000,
      })
    }
  )

  const handleClose = () => {
    reset({ name: '', description: '', licenseType: '', url: '' })
    onHide()
  }

  return (
    <>
      <Toast ref={toast} />
      <Dialog
        header="Create New Pack"
        visible={visible}
        style={{ width: '500px' }}
        onHide={handleClose}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={handleClose}
              className="p-button-text"
            />
            <Button
              label="Create"
              icon="pi pi-check"
              onClick={handleCreatePack}
              autoFocus
            />
          </div>
        }
      >
        <div className="p-fluid">
          <div className="field">
            <label htmlFor="pack-name">Name *</label>
            <InputText
              id="pack-name"
              {...register('name')}
              placeholder="Enter pack name"
            />
          </div>
          <div className="field">
            <label htmlFor="pack-description">Description</label>
            <InputTextarea
              id="pack-description"
              {...register('description')}
              rows={3}
              placeholder="Enter pack description (optional)"
            />
          </div>
          <div className="field">
            <label htmlFor="pack-license">License Type</label>
            <Controller
              control={control}
              name="licenseType"
              render={({ field }) => (
                <Dropdown
                  id="pack-license"
                  value={field.value}
                  options={LICENSE_OPTIONS}
                  onChange={e => field.onChange(e.value ?? '')}
                  placeholder="Select or type a license"
                  editable
                  showClear
                />
              )}
            />
          </div>
          <div className="field">
            <label htmlFor="pack-url">Reference URL</label>
            <InputText
              id="pack-url"
              {...register('url')}
              placeholder="https://example.com"
            />
          </div>
        </div>
      </Dialog>
    </>
  )
}
