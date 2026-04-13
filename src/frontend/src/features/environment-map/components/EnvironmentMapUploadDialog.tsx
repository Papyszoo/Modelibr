import './EnvironmentMapUploadDialog.css'

import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { type ZodTypeAny } from 'zod'

import { type EnvironmentMapCubeFace } from '@/features/environment-map/types'
import {
  getCubeFaceUploadName,
  getDroppedCubeFaceFiles,
  inferEnvironmentMapSizeLabel,
} from '@/features/environment-map/utils/environmentMapUploadUtils'
import {
  environmentMapUploadFormSchema,
  environmentMapVariantUploadFormSchema,
} from '@/shared/validation/formSchemas'

const CUBE_FACE_FIELDS: Array<{
  face: EnvironmentMapCubeFace
  label: string
  description: string
}> = [
  { face: 'px', label: 'PX', description: 'Positive X / Right' },
  { face: 'nx', label: 'NX', description: 'Negative X / Left' },
  { face: 'py', label: 'PY', description: 'Positive Y / Top' },
  { face: 'ny', label: 'NY', description: 'Negative Y / Bottom' },
  { face: 'pz', label: 'PZ', description: 'Positive Z / Front' },
  { face: 'nz', label: 'NZ', description: 'Negative Z / Back' },
]

interface EnvironmentMapUploadDialogValues {
  name: string
  sizeLabel: string
  sourceMode: 'single' | 'cube'
  assetFile: File | null
  thumbnailFile: File | null
  cubeFaces: Record<EnvironmentMapCubeFace, File | null>
}

export interface EnvironmentMapUploadDialogSubmitValues {
  name?: string
  sizeLabel?: string
  file?: File
  cubeFaces?: Record<EnvironmentMapCubeFace, File>
  thumbnailFile?: File | null
}

interface EnvironmentMapUploadDialogProps {
  visible: boolean
  title: string
  submitLabel: string
  loading?: boolean
  mode?: 'create' | 'variant'
  defaultName?: string
  showThumbnailField?: boolean
  onHide: () => void
  onSubmit: (
    values: EnvironmentMapUploadDialogSubmitValues
  ) => Promise<void> | void
}

function getDefaultValues(
  defaultName?: string
): EnvironmentMapUploadDialogValues {
  return {
    name: defaultName ?? '',
    sizeLabel: '',
    sourceMode: 'single',
    assetFile: null,
    thumbnailFile: null,
    cubeFaces: {
      px: null,
      nx: null,
      py: null,
      ny: null,
      pz: null,
      nz: null,
    },
  }
}

export function EnvironmentMapUploadDialog({
  visible,
  title,
  submitLabel,
  loading = false,
  mode = 'create',
  defaultName,
  showThumbnailField = false,
  onHide,
  onSubmit,
}: EnvironmentMapUploadDialogProps) {
  const schema = useMemo<ZodTypeAny>(
    () =>
      mode === 'create'
        ? environmentMapUploadFormSchema
        : environmentMapVariantUploadFormSchema,
    [mode]
  )

  const singleInputRef = useRef<HTMLInputElement | null>(null)
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null)
  const cubeInputRefs = useRef<
    Partial<Record<EnvironmentMapCubeFace, HTMLInputElement | null>>
  >({})

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EnvironmentMapUploadDialogValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: getDefaultValues(defaultName),
  })
  const [isDropActive, setIsDropActive] = useState(false)
  const sizeLabelEditedRef = useRef(false)
  const inferRequestRef = useRef(0)

  useEffect(() => {
    if (visible) {
      setIsDropActive(false)
      sizeLabelEditedRef.current = false
      reset(getDefaultValues(defaultName))
    }
  }, [defaultName, reset, visible])

  const sourceMode = watch('sourceMode')
  const assetFile = watch('assetFile')
  const thumbnailFile = watch('thumbnailFile')
  const cubeFaces = watch('cubeFaces')

  const updateSizeLabelFromFile = async (
    file: File | null | undefined,
    nextCubeFaces?: Partial<Record<EnvironmentMapCubeFace, File | null>>
  ) => {
    inferRequestRef.current += 1
    const requestId = inferRequestRef.current

    const inferredSizeLabel = await inferEnvironmentMapSizeLabel(
      file,
      nextCubeFaces
    )
    if (
      inferRequestRef.current !== requestId ||
      sizeLabelEditedRef.current ||
      !visible
    ) {
      return
    }

    setValue('sizeLabel', inferredSizeLabel ?? '', {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    })
  }

  const handleDialogDragEvent = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDialogDragEnter = (event: DragEvent<HTMLElement>) => {
    handleDialogDragEvent(event)
    if (sourceMode === 'cube') {
      setIsDropActive(true)
    }
  }

  const handleDialogDragLeave = (event: DragEvent<HTMLElement>) => {
    handleDialogDragEvent(event)
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    setIsDropActive(false)
  }

  const handleDialogDrop = (event: DragEvent<HTMLElement>) => {
    handleDialogDragEvent(event)
    setIsDropActive(false)

    const droppedFiles = Array.from(event.dataTransfer.files ?? [])
    if (droppedFiles.length === 0) {
      return
    }

    if (sourceMode === 'cube') {
      const droppedCubeFaces = getDroppedCubeFaceFiles(droppedFiles)
      const nextCubeFaces = {
        ...cubeFaces,
        ...droppedCubeFaces,
      }

      ;(Object.keys(droppedCubeFaces) as EnvironmentMapCubeFace[]).forEach(
        face => {
          setValue(
            `cubeFaces.${face}` as const,
            droppedCubeFaces[face] ?? null,
            {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            }
          )
        }
      )

      const representativeFile =
        nextCubeFaces.px ??
        nextCubeFaces.nx ??
        nextCubeFaces.py ??
        nextCubeFaces.ny ??
        nextCubeFaces.pz ??
        nextCubeFaces.nz

      if (mode === 'create' && !watch('name').trim()) {
        setValue('name', getCubeFaceUploadName(droppedFiles), {
          shouldDirty: true,
        })
      }

      void updateSizeLabelFromFile(representativeFile, nextCubeFaces)
      return
    }

    const droppedFile = droppedFiles[0] ?? null
    setValue('assetFile', droppedFile, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
    if (mode === 'create' && droppedFile && !watch('name').trim()) {
      setValue('name', droppedFile.name.replace(/\.[^.]+$/, ''), {
        shouldDirty: true,
      })
    }
    void updateSizeLabelFromFile(droppedFile)
  }

  const onFormSubmit = handleSubmit(async values => {
    await onSubmit({
      name: mode === 'create' ? values.name.trim() : undefined,
      sizeLabel: values.sizeLabel.trim() || undefined,
      file:
        values.sourceMode === 'single'
          ? (values.assetFile ?? undefined)
          : undefined,
      cubeFaces:
        values.sourceMode === 'cube'
          ? (values.cubeFaces as Record<EnvironmentMapCubeFace, File>)
          : undefined,
      thumbnailFile: showThumbnailField ? (values.thumbnailFile ?? null) : null,
    })

    onHide()
  })

  return (
    <Dialog
      header={title}
      visible={visible}
      style={{ width: 'min(720px, 92vw)' }}
      onHide={onHide}
      footer={
        <div className="environment-map-upload-dialog-footer">
          <Button
            label="Cancel"
            className="p-button-text"
            onClick={onHide}
            disabled={loading}
          />
          <Button
            label={submitLabel}
            icon="pi pi-upload"
            onClick={() => void onFormSubmit()}
            loading={loading}
          />
        </div>
      }
    >
      <div
        className={`environment-map-upload-dialog${isDropActive ? ' is-drop-active' : ''}`}
        onDragEnter={handleDialogDragEnter}
        onDragOver={handleDialogDragEvent}
        onDragLeave={handleDialogDragLeave}
        onDrop={handleDialogDrop}
      >
        {mode === 'create' ? (
          <div className="environment-map-upload-field">
            <label htmlFor="environment-map-name">Name</label>
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <InputText
                  id="environment-map-name"
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Environment Map"
                />
              )}
            />
            {errors.name ? (
              <small className="environment-map-upload-error">
                {String(errors.name.message)}
              </small>
            ) : null}
          </div>
        ) : null}

        <div className="environment-map-upload-row">
          <div className="environment-map-upload-field">
            <label htmlFor="environment-map-size-label">
              Size Label{mode === 'variant' ? '' : ' (optional)'}
            </label>
            <Controller
              control={control}
              name="sizeLabel"
              render={({ field }) => (
                <InputText
                  id="environment-map-size-label"
                  {...field}
                  value={field.value ?? ''}
                  placeholder={
                    mode === 'variant' ? '2K' : 'Original, 2K, 4K...'
                  }
                  onChange={event => {
                    sizeLabelEditedRef.current = true
                    field.onChange(event.target.value)
                  }}
                />
              )}
            />
            {errors.sizeLabel ? (
              <small className="environment-map-upload-error">
                {String(errors.sizeLabel.message)}
              </small>
            ) : (
              <small className="environment-map-upload-help">
                We will suggest a size from the uploaded dimensions. Edit it if
                needed.
              </small>
            )}
          </div>
        </div>

        <div className="environment-map-upload-field">
          <label>Source</label>
          <Controller
            control={control}
            name="sourceMode"
            render={({ field }) => (
              <div className="environment-map-upload-mode">
                <Button
                  type="button"
                  label="Panorama"
                  icon="pi pi-image"
                  className={`environment-map-upload-mode-button${field.value === 'single' ? ' is-active' : ''}`}
                  onClick={() => field.onChange('single')}
                />
                <Button
                  type="button"
                  label="Cube Faces"
                  icon="pi pi-th-large"
                  className={`environment-map-upload-mode-button${field.value === 'cube' ? ' is-active' : ''}`}
                  onClick={() => field.onChange('cube')}
                />
              </div>
            )}
          />
        </div>

        {sourceMode === 'single' ? (
          <Controller
            control={control}
            name="assetFile"
            render={({ field }) => (
              <div className="environment-map-upload-field">
                <label>Environment Map File</label>
                <input
                  ref={singleInputRef}
                  type="file"
                  accept="image/*,.hdr,.exr"
                  hidden
                  onChange={event => {
                    const file = event.target.files?.[0] ?? null
                    field.onChange(file)
                    if (mode === 'create' && file && !watch('name').trim()) {
                      setValue('name', file.name.replace(/\.[^.]+$/, ''), {
                        shouldDirty: true,
                      })
                    }
                    void updateSizeLabelFromFile(file)
                  }}
                />
                <div className="environment-map-upload-file-row">
                  <Button
                    type="button"
                    label={assetFile ? 'Replace File' : 'Choose File'}
                    icon="pi pi-folder-open"
                    className="p-button-outlined"
                    onClick={() => singleInputRef.current?.click()}
                  />
                  <span className="environment-map-upload-file-name">
                    {assetFile?.name ?? 'No file selected'}
                  </span>
                  {assetFile ? (
                    <Button
                      type="button"
                      icon="pi pi-times"
                      text
                      rounded
                      severity="secondary"
                      onClick={() => field.onChange(null)}
                    />
                  ) : null}
                </div>
                {errors.assetFile ? (
                  <small className="environment-map-upload-error">
                    {String(errors.assetFile.message)}
                  </small>
                ) : (
                  <small className="environment-map-upload-help">
                    Supports HDR, EXR, and image panoramas.
                  </small>
                )}
              </div>
            )}
          />
        ) : (
          <div className="environment-map-upload-field">
            <label>Cube Face Mapping</label>
            <div
              className={`environment-map-upload-dropzone${isDropActive ? ' is-drop-active' : ''}`}
            >
              <i className="pi pi-download" />
              <span>
                Drop cube face files here to populate PX, NX, PY, NY, PZ, and
                NZ.
              </span>
            </div>
            <div className="environment-map-cube-grid">
              {CUBE_FACE_FIELDS.map(({ face, label, description }) => (
                <Controller
                  key={face}
                  control={control}
                  name={`cubeFaces.${face}` as const}
                  render={({ field, fieldState }) => (
                    <div className="environment-map-cube-card">
                      <div className="environment-map-cube-card-header">
                        <strong>{label}</strong>
                        <span>{description}</span>
                      </div>
                      <input
                        ref={ref => {
                          cubeInputRefs.current[face] = ref
                        }}
                        type="file"
                        accept="image/*,.hdr,.exr"
                        hidden
                        onChange={event => {
                          const file = event.target.files?.[0] ?? null
                          field.onChange(file)
                          const nextCubeFaces = {
                            ...cubeFaces,
                            [face]: file,
                          }
                          if (
                            mode === 'create' &&
                            file &&
                            !watch('name').trim()
                          ) {
                            setValue(
                              'name',
                              getCubeFaceUploadName(
                                Object.values(nextCubeFaces).filter(
                                  (cubeFaceFile): cubeFaceFile is File =>
                                    cubeFaceFile !== null
                                )
                              ),
                              {
                                shouldDirty: true,
                              }
                            )
                          }
                          void updateSizeLabelFromFile(file, nextCubeFaces)
                        }}
                      />
                      <Button
                        type="button"
                        label={field.value ? 'Replace' : 'Choose'}
                        icon="pi pi-folder-open"
                        className="p-button-outlined p-button-sm"
                        onClick={() => cubeInputRefs.current[face]?.click()}
                      />
                      <span
                        className="environment-map-upload-file-name"
                        title={field.value?.name ?? ''}
                      >
                        {field.value?.name ?? 'No file selected'}
                      </span>
                      {field.value ? (
                        <Button
                          type="button"
                          icon="pi pi-times"
                          text
                          rounded
                          severity="secondary"
                          onClick={() => field.onChange(null)}
                        />
                      ) : null}
                      {fieldState.error ? (
                        <small className="environment-map-upload-error">
                          {fieldState.error.message}
                        </small>
                      ) : null}
                    </div>
                  )}
                />
              ))}
            </div>
            <small className="environment-map-upload-help">
              Match faces to px, nx, py, ny, pz, and nz exactly.
            </small>
          </div>
        )}

        {showThumbnailField ? (
          <Controller
            control={control}
            name="thumbnailFile"
            render={({ field }) => (
              <div className="environment-map-upload-field">
                <label>Custom Thumbnail (optional)</label>
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={event =>
                    field.onChange(event.target.files?.[0] ?? null)
                  }
                />
                <div className="environment-map-upload-file-row">
                  <Button
                    type="button"
                    label={
                      thumbnailFile ? 'Replace Thumbnail' : 'Choose Thumbnail'
                    }
                    icon="pi pi-image"
                    className="p-button-outlined"
                    onClick={() => thumbnailInputRef.current?.click()}
                  />
                  <span className="environment-map-upload-file-name">
                    {thumbnailFile?.name ?? 'No thumbnail selected'}
                  </span>
                  {thumbnailFile ? (
                    <Button
                      type="button"
                      icon="pi pi-times"
                      text
                      rounded
                      severity="secondary"
                      onClick={() => field.onChange(null)}
                    />
                  ) : null}
                </div>
              </div>
            )}
          />
        ) : null}
      </div>
    </Dialog>
  )
}
