import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useEffect, useMemo, useRef } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { type z } from 'zod'

import { uploadFile } from '@/features/models/api/modelApi'
import { setPackCustomThumbnail, updatePack } from '@/features/pack/api/packApi'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import { packDetailsFormSchema } from '@/shared/validation/formSchemas'
import { type PackDetailDto } from '@/types'

const LICENSE_OPTIONS = [
  'Royalty Free',
  'Editorial',
  'CC0',
  'CC BY',
  'CC BY-SA',
  'Custom',
].map(value => ({ label: value, value }))

type PackDetailsInput = z.input<typeof packDetailsFormSchema>
type PackDetailsOutput = z.output<typeof packDetailsFormSchema>

interface PackDetailsPanelProps {
  pack: PackDetailDto
  refetchContainer: () => Promise<void>
  showToast: (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }) => void
}

export function PackDetailsPanel({
  pack,
  refetchContainer,
  showToast,
}: PackDetailsPanelProps) {
  const queryClient = useQueryClient()
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null)

  const defaultValues = useMemo(
    () => ({
      name: pack.name,
      description: pack.description ?? '',
      licenseType: pack.licenseType ?? '',
      url: pack.url ?? '',
    }),
    [pack]
  )

  const { register, control, handleSubmit, reset } = useForm<
    PackDetailsInput,
    unknown,
    PackDetailsOutput
  >({
    resolver: zodResolver(packDetailsFormSchema),
    mode: 'onChange',
    defaultValues,
  })

  useEffect(() => {
    reset(defaultValues)
  }, [defaultValues, reset])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['packs'] }),
      queryClient.invalidateQueries({
        queryKey: ['container', 'pack', pack.id],
      }),
      refetchContainer(),
    ])
  }

  const updateMutation = useMutation({
    mutationFn: (payload: PackDetailsOutput) => updatePack(pack.id, payload),
    onSuccess: async () => {
      await invalidate()
      showToast({
        severity: 'success',
        summary: 'Saved',
        detail: 'Pack details updated.',
        life: 2500,
      })
    },
  })

  const thumbnailMutation = useMutation({
    mutationFn: async (file: File | null) => {
      if (file === null) {
        await setPackCustomThumbnail(pack.id, null)
        return
      }

      const upload = await uploadFile(file, { uploadType: 'file' })
      await setPackCustomThumbnail(pack.id, upload.fileId)
    },
    onSuccess: async () => {
      await invalidate()
      showToast({
        severity: 'success',
        summary: 'Updated',
        detail: 'Pack thumbnail updated.',
        life: 2500,
      })
    },
  })

  const onSave = handleSubmit(values => updateMutation.mutate(values))
  const thumbnailUrl = resolveApiAssetUrl(pack.customThumbnailUrl)

  return (
    <div className="container-rich-details">
      <div className="container-rich-layout">
        <div className="container-rich-main">
          <div className="container-rich-block">
            <div className="container-rich-header-row">
              <div>
                <span className="container-rich-kicker">Pack</span>
                <h3>Publishing Details</h3>
              </div>
              <Button
                label={updateMutation.isPending ? 'Saving...' : 'Save'}
                icon="pi pi-save"
                onClick={onSave}
                disabled={updateMutation.isPending}
              />
            </div>

            <div className="container-form-grid">
              <div className="container-form-field container-form-field-wide">
                <label htmlFor="pack-description">Description</label>
                <InputTextarea
                  id="pack-description"
                  {...register('description')}
                  rows={4}
                  placeholder="What belongs in this pack?"
                />
              </div>
              <div className="container-form-field">
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
              <div className="container-form-field">
                <label htmlFor="pack-url">Reference URL</label>
                <InputText
                  id="pack-url"
                  {...register('url')}
                  placeholder="https://example.com/pack"
                />
              </div>
            </div>
          </div>
        </div>

        <aside className="container-rich-side">
          <div className="container-rich-block">
            <span className="container-rich-kicker">Thumbnail</span>
            <h3>Cover Image</h3>
            <div className="container-cover-card">
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt={pack.name} />
              ) : (
                <div className="container-cover-placeholder">
                  <i className="pi pi-box" />
                  <span>No custom thumbnail</span>
                </div>
              )}
            </div>

            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async event => {
                const file = event.target.files?.[0]
                if (file) {
                  thumbnailMutation.mutate(file)
                }
                event.target.value = ''
              }}
            />

            <div className="container-cover-actions">
              <Button
                label="Upload"
                icon="pi pi-upload"
                className="p-button-outlined"
                onClick={() => thumbnailInputRef.current?.click()}
                disabled={thumbnailMutation.isPending}
              />
              <Button
                label="Clear"
                icon="pi pi-trash"
                severity="secondary"
                text
                onClick={() => thumbnailMutation.mutate(null)}
                disabled={!thumbnailUrl || thumbnailMutation.isPending}
              />
            </div>
          </div>

          <div className="container-rich-block">
            <span className="container-rich-kicker">Snapshot</span>
            <div className="container-detail-assets">
              <span>{pack.modelCount} models</span>
              <span>{pack.textureSetCount} texture sets</span>
              <span>{pack.spriteCount} sprites</span>
              <span>{pack.soundCount} sounds</span>
              <span>{pack.environmentMapCount ?? 0} environment maps</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
