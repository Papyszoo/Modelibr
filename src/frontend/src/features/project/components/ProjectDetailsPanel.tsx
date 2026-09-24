import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { InputTextarea } from 'primereact/inputtextarea'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { type z } from 'zod'

import {
  getFilePreviewUrl,
  getFileUrl,
  uploadFile,
} from '@/features/models/api/modelApi'
import {
  addProjectConceptImage,
  removeProjectConceptImage,
  setProjectCustomThumbnail,
  updateProject,
} from '@/features/project/api/projectApi'
import { useTabUiState } from '@/hooks/useTabUiState'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import { ImageLightboxDialog } from '@/shared/components/ImageLightboxDialog'
import { projectDetailsFormSchema } from '@/shared/validation/formSchemas'
import { type ProjectDetailDto } from '@/types'

import { ProjectProfileSection } from './ProjectProfileSection'

type ProjectDetailsInput = z.input<typeof projectDetailsFormSchema>
type ProjectDetailsOutput = z.output<typeof projectDetailsFormSchema>

type OverviewDraft = {
  description: string
  notes: string
}

type StoredOverviewState = {
  dirty: boolean
  draft: OverviewDraft
}

interface ProjectDetailsPanelProps {
  project: ProjectDetailDto
  tabId?: string
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
  tabId,
  refetchContainer,
  showToast,
}: ProjectDetailsPanelProps) {
  const queryClient = useQueryClient()
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null)
  const conceptInputRef = useRef<HTMLInputElement | null>(null)
  const [activeConceptImageIndex, setActiveConceptImageIndex] = useState<
    number | null
  >(null)
  const tabStateKey = tabId ?? `project-${project.id}`
  const [storedOverviewState, setStoredOverviewState] =
    useTabUiState<StoredOverviewState | null>(
      tabStateKey,
      'projectOverviewState',
      null
    )
  const storedOverviewDraft = storedOverviewState?.draft ?? null
  const storedOverviewDirty = storedOverviewState?.dirty ?? false
  const [storedProfileDirty] = useTabUiState<boolean>(
    tabStateKey,
    'projectProfileDirty',
    false
  )
  const [, setHasUnsavedChanges] = useTabUiState<boolean>(
    tabStateKey,
    'hasUnsavedChanges',
    false
  )
  const [overviewDirty, setOverviewDirty] = useState(storedOverviewDirty)
  const [profileDirty, setProfileDirty] = useState(storedProfileDirty)

  const serverOverview = useMemo<OverviewDraft>(
    () => ({
      description: project.description ?? '',
      notes: project.notes ?? '',
    }),
    [project.description, project.notes]
  )
  const defaultValues = useMemo(
    () => ({
      name: project.name,
      ...(storedOverviewDraft ?? serverOverview),
    }),
    [project.name, serverOverview, storedOverviewDraft]
  )

  const { register, handleSubmit, reset, watch } = useForm<
    ProjectDetailsInput,
    unknown,
    ProjectDetailsOutput
  >({
    resolver: zodResolver(projectDetailsFormSchema),
    mode: 'onChange',
    defaultValues,
  })
  const description = watch('description')
  const notes = watch('notes')
  const currentOverview = {
    description: description ?? '',
    notes: notes ?? '',
  }
  const currentOverviewRef = useRef(currentOverview)
  currentOverviewRef.current = currentOverview
  const hydratedOverview = useRef<string | null>(null)
  const storedOverviewDraftRef = useRef(storedOverviewDraft)
  const storedOverviewDirtyRef = useRef(storedOverviewDirty)
  storedOverviewDraftRef.current = storedOverviewDraft
  storedOverviewDirtyRef.current = storedOverviewDirty

  // Cover and reference-board writes refetch the containing Project. Re-seed a
  // clean Overview from a changed server response, but never reset because an
  // unrelated Project field changed (or because the draft itself was persisted).
  useEffect(() => {
    const signature = overviewServerSignature(project.id, serverOverview)
    if (hydratedOverview.current === signature) return
    hydratedOverview.current = signature

    if (!storedOverviewDirtyRef.current) {
      reset({ name: project.name, ...serverOverview })
      return
    }

    const draft = storedOverviewDraftRef.current
    if (draft && overviewDraftsEqual(draft, serverOverview)) {
      reset({ name: project.name, ...serverOverview })
      setStoredOverviewState(null)
      setOverviewDirty(false)
    }
  }, [project.id, project.name, reset, serverOverview, setStoredOverviewState])

  useEffect(() => {
    const current = {
      description: description ?? '',
      notes: notes ?? '',
    }
    const dirty = !overviewDraftsEqual(current, serverOverview)
    setOverviewDirty(dirty)
    setStoredOverviewState(dirty ? { dirty: true, draft: current } : null)
  }, [description, notes, serverOverview, setStoredOverviewState])

  useEffect(() => {
    setProfileDirty(storedProfileDirty)
  }, [storedProfileDirty])

  useEffect(() => {
    setHasUnsavedChanges(overviewDirty || profileDirty)
  }, [overviewDirty, profileDirty, setHasUnsavedChanges])

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
    onSuccess: async (_result, values) => {
      const savedDraft = {
        description: values.description ?? '',
        notes: values.notes ?? '',
      }

      // Preserve edits made while the request was in flight. Only the submitted
      // snapshot is allowed to become clean; a newer draft remains dirty and is
      // re-stored after the containing Project refetch completes.
      if (overviewDraftsEqual(currentOverviewRef.current, savedDraft)) {
        reset({ name: project.name, ...savedDraft })
        setStoredOverviewState(null)
        setOverviewDirty(false)
      }

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

      const upload = await uploadFile(file, { uploadType: 'file' })
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
        const upload = await uploadFile(file, { uploadType: 'file' })
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
  const thumbnailUrl = resolveApiAssetUrl(project.customThumbnailUrl)
  const lightboxImages = project.conceptImages.map(image => ({
    id: image.fileId,
    name: image.fileName,
    previewUrl:
      resolveApiAssetUrl(image.previewUrl) ||
      getFilePreviewUrl(String(image.fileId)),
    fullUrl:
      resolveApiAssetUrl(image.fileUrl) || getFileUrl(String(image.fileId)),
  }))

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
            <ProjectProfileSection
              projectId={project.id}
              tabId={tabStateKey}
              onDirtyChange={setProfileDirty}
              showToast={showToast}
            />
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

            <ImageLightboxDialog
              visible={activeConceptImageIndex !== null}
              title="Project concept image"
              images={lightboxImages}
              activeIndex={activeConceptImageIndex ?? 0}
              onIndexChange={setActiveConceptImageIndex}
              onHide={() => setActiveConceptImageIndex(null)}
            />

            {project.conceptImages.length === 0 ? (
              <div className="container-empty-media">
                <i className="pi pi-images" />
                <p>No concept images yet.</p>
              </div>
            ) : (
              <div className="container-media-grid">
                {project.conceptImages.map((image, index) => (
                  <div key={image.fileId} className="container-media-card">
                    <button
                      type="button"
                      className="container-media-preview"
                      aria-label={`Open concept image ${image.fileName}`}
                      onClick={() => setActiveConceptImageIndex(index)}
                    >
                      <img
                        src={
                          resolveApiAssetUrl(image.previewUrl) ||
                          getFilePreviewUrl(String(image.fileId))
                        }
                        alt={image.fileName}
                      />
                    </button>
                    <div className="container-media-card-footer">
                      <span title={image.fileName}>{image.fileName}</span>
                      <Button
                        icon="pi pi-times"
                        text
                        rounded
                        severity="danger"
                        onClick={event => {
                          event.stopPropagation()
                          removeConceptMutation.mutate(image.fileId)
                        }}
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
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt={project.name} />
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
                disabled={!thumbnailUrl || thumbnailMutation.isPending}
              />
            </div>
          </div>

          <div className="container-rich-block">
            <span className="container-rich-kicker">Snapshot</span>
            <div className="container-detail-assets">
              <span>{project.modelCount} models</span>
              <span>{project.globalMaterialCount} global materials</span>
              <span>{project.multiModelTextureCount} multi-model textures</span>
              <span>{project.spriteCount} sprites</span>
              <span>{project.soundCount} sounds</span>
              <span>{project.environmentMapCount ?? 0} environment maps</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function overviewServerSignature(
  projectId: number,
  overview: OverviewDraft
): string {
  return `${projectId}:${JSON.stringify(overview)}`
}

function overviewDraftsEqual(
  left: OverviewDraft,
  right: OverviewDraft
): boolean {
  return left.description === right.description && left.notes === right.notes
}
