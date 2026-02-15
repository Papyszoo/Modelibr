import { useState } from 'react'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { createPack, deletePack } from '@/features/pack/api/packApi'
import { usePacksQuery } from '@/features/pack/api/queries'
import { PackDto } from '@/types'
import { openTabInPanel } from '@/utils/tabNavigation'
import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { packCreateFormSchema } from '@/shared/validation/formSchemas'
import './PackList.css'

type PackCreateFormInput = z.input<typeof packCreateFormSchema>
type PackCreateFormOutput = z.output<typeof packCreateFormSchema>

export function PackList() {
  const queryClient = useQueryClient()
  const packsQuery = usePacksQuery()
  const packs = packsQuery.data ?? []
  const loading = packsQuery.isLoading
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const toast = useRef<Toast>(null)

  const { register, handleSubmit, reset } = useForm<
    PackCreateFormInput,
    unknown,
    PackCreateFormOutput
  >({
    resolver: zodResolver(packCreateFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.packs

  const invalidatePacks = async () => {
    await queryClient.invalidateQueries({ queryKey: ['packs'] })
  }

  const createPackMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      createPack(payload),
    onSuccess: async () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Pack created successfully',
        life: 3000,
      })

      setShowCreateDialog(false)
      reset({ name: '', description: '' })
      await invalidatePacks()
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

  const deletePackMutation = useMutation({
    mutationFn: (packId: number) => deletePack(packId),
    onMutate: async packId => {
      await queryClient.cancelQueries({ queryKey: ['packs'] })
      const previousPacks = queryClient.getQueryData<PackDto[]>(['packs'])
      queryClient.setQueryData<PackDto[]>(['packs'], current =>
        (current ?? []).filter(p => p.id !== packId)
      )
      return { previousPacks }
    },
    onError: (error, _packId, context) => {
      console.error('Failed to delete pack:', error)
      if (context?.previousPacks) {
        queryClient.setQueryData(['packs'], context.previousPacks)
      }
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete pack',
        life: 3000,
      })
    },
    onSuccess: () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Pack deleted successfully',
        life: 3000,
      })
    },
    onSettled: async () => {
      await invalidatePacks()
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

  const handleDeletePack = async (packId: number) => {
    await deletePackMutation.mutateAsync(packId)
  }

  const getPackThumbnail = (_pack: PackDto) => {
    // TODO: Add pack thumbnail support
    // For now, return null - will be implemented when thumbnail upload is added
    return null
  }

  return (
    <div className="pack-list">
      <Toast ref={toast} />

      <div className="pack-list-header">
        <h2>Packs</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <CardWidthSlider
            value={cardWidth}
            min={200}
            max={500}
            onChange={width => setCardWidth('packs', width)}
          />
          <Button
            label="Create Pack"
            icon="pi pi-plus"
            onClick={() => setShowCreateDialog(true)}
          />
        </div>
      </div>

      {loading ? (
        <div className="pack-list-loading">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }} />
          <p>Loading packs...</p>
        </div>
      ) : packs.length === 0 ? (
        <div className="pack-list-empty">
          <i className="pi pi-box" style={{ fontSize: '3rem' }} />
          <h3>No Packs Yet</h3>
          <p>Create your first pack to organize models and texture sets</p>
          <Button
            label="Create Pack"
            icon="pi pi-plus"
            onClick={() => setShowCreateDialog(true)}
          />
        </div>
      ) : (
        <div
          className="pack-grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
          }}
        >
          {packs.map(pack => {
            const thumbnail = getPackThumbnail(pack)
            return (
              <div
                key={pack.id}
                className="pack-grid-card"
                onClick={() => {
                  openTabInPanel(
                    'packViewer',
                    'left',
                    pack.id.toString(),
                    pack.name
                  )
                }}
              >
                <div className="pack-grid-card-image">
                  {thumbnail ? (
                    <img src={thumbnail} alt={pack.name} />
                  ) : (
                    <div className="pack-grid-card-placeholder">
                      <i className="pi pi-box" />
                    </div>
                  )}
                </div>
                <div className="pack-grid-card-content">
                  <h3 className="pack-grid-card-title">{pack.name}</h3>
                  {pack.description && (
                    <p className="pack-grid-card-description">
                      {pack.description}
                    </p>
                  )}
                  <div className="pack-grid-card-stats">
                    <span>
                      <i className="pi pi-cube" /> {pack.modelCount}
                    </span>
                    <span>
                      <i className="pi pi-palette" /> {pack.textureSetCount}
                    </span>
                    <span>
                      <i className="pi pi-image" /> {pack.spriteCount}
                    </span>
                  </div>
                </div>
                <div className="pack-grid-card-actions">
                  <Button
                    icon="pi pi-trash"
                    className="p-button-text p-button-rounded p-button-danger p-button-sm"
                    tooltip="Delete Pack"
                    disabled={deletePackMutation.isPending}
                    onClick={e => {
                      e.stopPropagation()
                      handleDeletePack(pack.id)
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog
        header="Create New Pack"
        visible={showCreateDialog}
        style={{ width: '500px' }}
        onHide={() => {
          setShowCreateDialog(false)
          reset({ name: '', description: '' })
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                setShowCreateDialog(false)
                reset({ name: '', description: '' })
              }}
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
        </div>
      </Dialog>
    </div>
  )
}
