import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { InputTextarea } from 'primereact/inputtextarea'
import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { type z } from 'zod'

import { uploadFile } from '@/features/models/api/modelApi'
import {
  addProjectConceptImage,
  removeProjectConceptImage,
  setProjectCustomThumbnail,
  updateProject,
} from '@/features/project/api/projectApi'
import { type ProjectDetailDto } from '@/types'
import { projectDetailsFormSchema } from '@/shared/validation/formSchemas'

type ProjectDetailsInput = z.input<typeof projectDetailsFormSchema>
type ProjectDetailsOutput = z.output<typeof projectDetailsFormSchema>

interface ProjectDetailsPanelProps {
  project: ProjectDetailDto
  refetchContainer: () => Promise<void>
  showToast: (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }) => void
}

export function ProjectDetailsPanel({
  project,
  refetchContainer,
  showToast,
}: ProjectDetailsPanelProps) {
  const queryClient = useQueryClient()
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null)
  const conceptInputRef = useRef<HTMLInputElement | null>(null)

  const defaultValues = useMemo(
    () => ({
      name: project.name,
      description: project.description ?? '',
      notes: project.notes ?? '',
    }),
    [project]
  )

  const { register, handleSubmit, reset } = useForm<
    ProjectDetailsInput,
    unknown,
    ProjectDetailsOutput
  >({
    resolver: zodResolver(projectDetailsFormSchema),
    mode: 'onChange',
    defaultValues,
  })

  useEffect(() => {
    reset(defaultValues)
  }, [defaultValues, reset])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({
        queryKey: ['container', 'project', project.id],
      }),
      refetchContainer(),
    ])
  }

  const updateMutation = useMutation({
    mutationFn: (payload: ProjectDetailsOutput) =>
      updateProject(project.id, payload),
    onSuccess: async () => {
      await invalidate()
      showToast({
        severity: 'success',
        summary: 'Saved',
        detail: 'Project details updated.',
        life: 2500,
      })
    },
  })

  const thumbnailMutation = useMutation({
    mutationFn: async (file: File | null) => {
      if (file === null) {
        await setProjectCustomThumbnail(project.id, null)
        return
      }

      const upload = await uploadFile(file, { uploadType: 'project-thumbnail' })
      await setProjectCustomThumbnail(project.id, upload.fileId)
    },
    onSuccess: async () => {
      await invalidate()
      showToast({
        severity: 'success',
        summary: 'Updated',
        detail: 'Project thumbnail updated.',
        life: 2500,
      })
    },
  })

  const conceptMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const upload = await uploadFile(file, { uploadType: 'project-concept' })
        await addProjectConceptImage(project.id, upload.fileId)
      }
    },
    onSuccess: async () => {
      await invalidate()
      showToast({
        severity: 'success',
        summary: 'Uploaded',
        detail: 'Project concept images updated.',
        life: 2500,
      })
    },
  })

  const removeConceptMutation = useMutation({
    mutationFn: (fileId: number) =>
      removeProjectConceptImage(project.id, fileId),
    onSuccess: async () => {
      await invalidate()
    },
  })

  const onSave = handleSubmit(values => updateMutation.mutate(values))

  return (
    <div className="container-rich-details">
      <div className="container-rich-layout">
        <div className="container-rich-main">
          <div className="container-rich-block">
            <div className="container-rich-header-row">
              <div>
                <span className="container-rich-kicker">Project</span>
                <h3>Overview</h3>
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
                <label htmlFor="project-description">Description</label>
                <InputTextarea
                  id="project-description"
                  {...register('description')}
                  rows={4}
                  placeholder="Short summary for this project"
                />
              </div>
              <div className="container-form-field container-form-field-wide">
                <label htmlFor="project-notes">Notes</label>
                <InputTextarea
                  id="project-notes"
                  {...register('notes')}
                  rows={6}
                  placeholder="Planning notes, art direction, production reminders"
                />
              </div>
            </div>
          </div>

          <div className="container-rich-block">
            <div className="container-rich-header-row">
              <div>
                <span className="container-rich-kicker">Concept Art</span>
                <h3>Reference Board</h3>
              </div>
              <Button
                label="Add Images"
                icon="pi pi-images"
                className="p-button-outlined"
                onClick={() => conceptInputRef.current?.click()}
                disabled={conceptMutation.isPending}
              />
            </div>

            <input
              ref={conceptInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={async event => {
                const files = Array.from(event.target.files ?? [])
                if (files.length > 0) {
                  conceptMutation.mutate(files)
                }
                event.target.value = ''
              }}
            />

            {project.conceptImages.length === 0 ? (
              <div className="container-empty-media">
                <i className="pi pi-images" />
                <p>No concept images yet.</p>
              </div>
            ) : (
              <div className="container-media-grid">
                {project.conceptImages.map(image => (
                  <div key={image.fileId} className="container-media-card">
                    <img src={image.previewUrl} alt={image.fileName} />
                    <div className="container-media-card-footer">
                      <span title={image.fileName}>{image.fileName}</span>
                      <Button
                        icon="pi pi-times"
                        text
                        rounded
                        severity="danger"
                        onClick={() =>
                          removeConceptMutation.mutate(image.fileId)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="container-rich-side">
          <div className="container-rich-block">
            <div className="container-rich-header-row">
              <div>
                <span className="container-rich-kicker">Thumbnail</span>
                <h3>Cover Image</h3>
              </div>
            </div>

            <div className="container-cover-card">
              {project.customThumbnailUrl ? (
                <img src={project.customThumbnailUrl} alt={project.name} />
              ) : (
                <div className="container-cover-placeholder">
                  <i className="pi pi-image" />
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
                disabled={
                  !project.customThumbnailUrl || thumbnailMutation.isPending
                }
              />
            </div>
          </div>

          <div className="container-rich-block">
            <span className="container-rich-kicker">Snapshot</span>
            <div className="container-detail-assets">
              <span>{project.modelCount} models</span>
              <span>{project.textureSetCount} texture sets</span>
              <span>{project.spriteCount} sprites</span>
              <span>{project.soundCount} sounds</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
