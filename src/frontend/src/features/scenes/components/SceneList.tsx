import './SceneList.css'

import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { type JSX, useRef, useState } from 'react'

import { useProjectsQuery } from '@/features/project/api/queries'
import { ApiClientError } from '@/lib/apiBase'
import {
  Dialog,
  EmptyState,
  ErrorState,
  ListHeader,
  LoadingState,
} from '@/shared/components'
import { AddTile, AssetGrid, AssetTile } from '@/shared/components/asset-tile'

import {
  isDefiniteWriteRefusal,
  useCreateSceneMutation,
  useDeleteSceneMutation,
  useScenesQuery,
  useSetSceneProjectMutation,
} from '../api/queries'
import type { SceneSummary } from '../types'

interface SceneListProps {
  onOpenScene: (sceneId: number) => void
}

export function SceneList({ onOpenScene }: SceneListProps): JSX.Element {
  const { data: scenes, isLoading, error, refetch } = useScenesQuery()
  const createScene = useCreateSceneMutation()
  const linkProject = useSetSceneProjectMutation()
  const { data: projects = [] } = useProjectsQuery()
  const deleteScene = useDeleteSceneMutation()

  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SceneSummary | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  /**
   * The scene that exists, and the project it still wants, after a link failed.
   *
   * <p>
   * Creating is two writes - the scene, then the link, because linking is its
   * own audited scene write and folding it into creation would leave it no
   * revision of its own to undo. So a failure between them is real, and it must
   * not lose what the user asked for: the scene id is kept so any follow-up acts
   * on THAT scene rather than making a second one, and the dialog stays open
   * saying so.
   * </p>
   *
   * <p>
   * <b>What may be offered next depends on what the failure knows.</b> A server
   * that ANSWERED and refused - a project that no longer exists, a validation
   * error - moved nothing, so sending the same write again is an ordinary retry.
   * A dropped connection, a timeout, a 5xx or an error this client cannot read
   * reached an unknown point in the write and may have committed: resending it
   * would link a scene that is already linked, and - worse - would overwrite a
   * project somebody else may have set in the meantime, because the retry
   * carries the value from before. There is exactly one safe move there, and it
   * is to go and look: open the scene, which fetches it authoritatively and
   * reconciles the hold the failed write left behind.
   * </p>
   */
  const [linkFailure, setLinkFailure] = useState<{
    sceneId: number
    projectId: number
    /**
     * True only when the server itself refused. False means the outcome is
     * unknown, and "Retry" is not on offer.
     */
    canRetry: boolean
  } | null>(null)

  /**
   * In-flight guard, synchronous on purpose.
   *
   * `createScene.isPending` is React state: it is set when the mutation's render
   * lands, not when it starts. Two clicks in the same tick - or a held Enter,
   * which repeats far faster than React commits - both read the old `false` and
   * both create a scene. Only a ref changes in the same turn of the event loop
   * that read it.
   */
  const submitting = useRef(false)

  // After an ambiguous link the dialog has nothing left to submit - the only
  // move is to open the scene - so the confirm button is about creating, or
  // about a retry the server has earned by answering.
  const canSubmit = Boolean(name.trim()) || (linkFailure?.canRetry ?? false)
  const isBusy = createScene.isPending || linkProject.isPending

  /**
   * The one guarded submission path. Enter, the Create button and any repeat of
   * either land here, so the guard cannot be bypassed by the route that does not
   * go through a disabled attribute - `disabled` describes a button, and a
   * keydown handler is not a button.
   */
  const handleCreate = async () => {
    if (submitting.current) {
      return
    }

    // A retry after a link failure links the scene that already exists. Creating
    // again here is exactly the duplicate this whole path is arranged to avoid.
    if (linkFailure) {
      // ...and only when the server answered. An unknown outcome is not retried
      // from here at all: the write may have landed, and this path holds the
      // project the user picked BEFORE it, so resending it could overwrite a
      // change made since. `openCreatedScene` is the way out.
      if (!linkFailure.canRetry) {
        return
      }

      submitting.current = true
      try {
        await linkAndFinish(linkFailure.sceneId, linkFailure.projectId)
      } finally {
        submitting.current = false
      }
      return
    }

    const trimmed = name.trim()
    if (!trimmed) {
      return
    }

    submitting.current = true
    setCreateError(null)

    try {
      let created
      try {
        created = await createScene.mutateAsync({
          name: trimmed,
          description: description.trim() || undefined,
        })
      } catch (caught) {
        setCreateError(
          caught instanceof ApiClientError
            ? caught.message
            : 'The scene could not be created.'
        )
        return
      }

      // Past this point the scene EXISTS. The form must never return to a state
      // where submitting it would create another one - see `linkFailure`.
      if (projectId === null) {
        finish(created.scene.id)
        return
      }

      await linkAndFinish(created.scene.id, projectId)
    } finally {
      submitting.current = false
    }
  }

  const linkAndFinish = async (sceneId: number, wantedProjectId: number) => {
    setCreateError(null)
    try {
      await linkProject.mutateAsync({ sceneId, projectId: wantedProjectId })
    } catch (caught) {
      // Reported, not swallowed. The scene is real and the link is not, and a
      // user who asked for a project and silently got none has no way to know.
      //
      // Whether a retry is offered is decided HERE, by the same test the editor
      // uses to decide whether the hold may be released: only a request the
      // server answered and refused is known to have changed nothing.
      const canRetry = isDefiniteWriteRefusal(caught)
      setLinkFailure({ sceneId, projectId: wantedProjectId, canRetry })
      setCreateError(
        (caught instanceof ApiClientError
          ? `The scene was created, but linking it to the project failed: ${caught.message}`
          : 'The scene was created, but linking it to the project failed.') +
          (canRetry
            ? ''
            : ' It is not known whether the link was saved, so it cannot be sent again - open the scene to see what it says.')
      )
      return
    }

    setLinkFailure(null)
    finish(sceneId)
  }

  const finish = (sceneId: number) => {
    setIsCreating(false)
    setName('')
    setDescription('')
    setProjectId(null)
    setCreateError(null)
    setLinkFailure(null)
    onOpenScene(sceneId)
  }

  /**
   * Opens the scene that was created, whatever became of its link.
   *
   * <p>
   * After a refusal this is "give up on the project". After an unknown outcome
   * it is the reconciliation: opening the scene fetches it authoritatively, and
   * the hold the failed write left on it (see `sceneLinkHoldStore`) ends when
   * that data lands and the editor's draft is sitting on it. Either way the user
   * ends up looking at what the server actually has, which is the only honest
   * answer available.
   * </p>
   */
  const openCreatedScene = () => {
    if (linkFailure) {
      finish(linkFailure.sceneId)
    }
  }

  const closeCreate = () => {
    // Dismissing after a link failure still leaves a real scene behind, so the
    // form is reset rather than kept - reopening it must not offer to retry a
    // link for a scene the user has walked away from.
    setIsCreating(false)
    setCreateError(null)
    setLinkFailure(null)
  }

  if (isLoading) {
    return <LoadingState message="Loading scenes…" />
  }

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof ApiClientError
            ? error.message
            : 'Scenes could not be loaded.'
        }
        onRetry={() => void refetch()}
      />
    )
  }

  const items = scenes ?? []

  return (
    <div className="scene-list" data-testid="scene-list">
      <ListHeader
        title="Scenes"
        subtitle="Compose library assets into a scene - by hand, or through an agent over MCP."
        stats={[{ icon: 'pi-box', label: `${items.length} scenes` }]}
        actions={
          <Button
            icon="pi pi-plus"
            label="New scene"
            size="small"
            data-testid="scene-list-new"
            onClick={() => setIsCreating(true)}
          />
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon="pi-box"
          title="No scenes yet"
          message="A scene holds library assets placed in 3D space. Create one, then add models to it."
          action={
            <Button
              icon="pi pi-plus"
              label="New scene"
              size="small"
              onClick={() => setIsCreating(true)}
            />
          }
        />
      ) : (
        <AssetGrid cardWidth={200} className="scene-list-grid">
          {items.map(scene => (
            <AssetTile
              key={scene.id}
              name={scene.name}
              meta={describeScene(scene)}
              dataAttributes={{
                'data-testid': 'scene-tile',
                'data-scene-id': scene.id,
              }}
              onClick={() => onOpenScene(scene.id)}
              onContextMenu={event => {
                event.preventDefault()
                setPendingDelete(scene)
              }}
              media={
                // Scenes have no preview render yet, so the tile shows the
                // scene glyph rather than an empty frame. When the render-back
                // lands this is where its image goes.
                <div className="scene-list-tile-media">
                  <i className="pi pi-box" aria-hidden />
                </div>
              }
            />
          ))}
          <AddTile label="New scene" onClick={() => setIsCreating(true)} />
        </AssetGrid>
      )}

      <Dialog
        open={isCreating}
        onClose={closeCreate}
        header="New scene"
        size="sm"
        footer={
          <>
            {linkFailure ? (
              <Button
                label={
                  linkFailure.canRetry
                    ? 'Open without a project'
                    : 'Open the scene'
                }
                text={linkFailure.canRetry}
                size="small"
                data-testid="scene-create-skip-link"
                onClick={openCreatedScene}
              />
            ) : (
              <Button label="Cancel" text size="small" onClick={closeCreate} />
            )}
            {/*
              "Retry link" appears only for a link the server refused. After an
              unknown outcome there is no second write to offer: the only button
              left is the one that goes and looks.
            */}
            {linkFailure && !linkFailure.canRetry ? null : (
              <Button
                label={linkFailure ? 'Retry link' : 'Create'}
                icon={linkFailure ? 'pi pi-refresh' : 'pi pi-check'}
                size="small"
                data-testid="scene-create-confirm"
                // Both pending flags, not just the first: the scene is already
                // created while the project link is in flight, so a button that
                // re-enabled there would make a second one on the next click.
                // The real guard is inside handleCreate - this only stops the
                // button LOOKING available.
                disabled={!canSubmit || isBusy}
                loading={isBusy}
                onClick={() => void handleCreate()}
              />
            )}
          </>
        }
      >
        <div className="scene-list-form">
          {createError ? (
            <p
              className="scene-list-form-error"
              data-testid="scene-create-error"
            >
              {createError}
            </p>
          ) : null}
          <label htmlFor="scene-name">Name</label>
          <InputText
            id="scene-name"
            value={name}
            autoFocus
            placeholder="Rundown city street"
            // The scene already exists once a link has failed; renaming it is a
            // different operation and not one this dialog offers.
            disabled={linkFailure !== null}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              // Enter goes through the SAME guarded handler as the button, and
              // is refused on the same conditions. It used to call handleCreate
              // whatever the button's disabled state said.
              if (event.key !== 'Enter') {
                return
              }
              event.preventDefault()
              if (!canSubmit || isBusy) {
                return
              }
              void handleCreate()
            }}
          />

          {/*
            Optional, and worth setting: a scene's project is what biases the
            agent's search, what its budget is measured against, and what world
            convention it composes in. A scene with none gets none of that.
          */}
          <label htmlFor="scene-project">Project</label>
          <Dropdown
            inputId="scene-project"
            value={projectId}
            options={[
              { label: 'No project', value: null },
              ...projects.map(project => ({
                label: project.name,
                value: project.id,
              })),
            ]}
            placeholder="No project"
            data-testid="scene-create-project"
            disabled={linkFailure !== null}
            onChange={event => setProjectId(event.value ?? null)}
          />

          <label htmlFor="scene-description">Description</label>
          <InputTextarea
            id="scene-description"
            value={description}
            rows={3}
            autoResize
            placeholder="What this scene is for - optional, and useful to an agent."
            disabled={linkFailure !== null}
            onChange={event => setDescription(event.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        header="Delete scene"
        size="sm"
        footer={
          <>
            <Button
              label="Cancel"
              text
              size="small"
              onClick={() => setPendingDelete(null)}
            />
            <Button
              label="Delete"
              icon="pi pi-trash"
              severity="danger"
              size="small"
              loading={deleteScene.isPending}
              onClick={async () => {
                if (pendingDelete) {
                  await deleteScene.mutateAsync(pendingDelete.id)
                }
                setPendingDelete(null)
              }}
            />
          </>
        }
      >
        <p className="scene-list-confirm">
          Delete <strong>{pendingDelete?.name}</strong>? The assets it
          references are not affected - only the composition is removed.
        </p>
      </Dialog>
    </div>
  )
}

/**
 * The tile's second line. A scene whose document the server could not read
 * reports -1 counts; saying so is the point - hiding a broken scene is how a
 * user loses one without being told.
 */
function describeScene(scene: SceneSummary): string {
  if (scene.nodeCount < 0) {
    return 'Document unreadable'
  }

  const nodes = `${scene.nodeCount} node${scene.nodeCount === 1 ? '' : 's'}`
  const lights = `${scene.lightCount} light${scene.lightCount === 1 ? '' : 's'}`
  return `${nodes} · ${lights}`
}
