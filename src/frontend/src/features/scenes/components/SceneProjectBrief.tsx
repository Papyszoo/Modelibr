import './SceneProjectBrief.css'

import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { OverlayPanel } from 'primereact/overlaypanel'
import { type JSX, useEffect, useRef, useState } from 'react'

import { useProjectsQuery } from '@/features/project/api/queries'
import { useProjectBriefQuery } from '@/features/project/api/queries'
import { ApiClientError } from '@/lib/apiBase'

import { useSetSceneProjectMutation } from '../api/queries'
import { type ProjectLinkStatus } from '../hooks/useProjectLinkSerialization'

/**
 * The project a scene belongs to, and - behind it - the brief the agent was
 * given about that project.
 *
 * This is the honesty feature (v0.6 prompt 13-E). When the agent picks a hero
 * building nobody would have chosen, the useful question is not "why did it do
 * that" but "what did we tell it": the guidance lines here are verbatim what
 * the tools hand over, so a wrong answer can be traced to a wrong input rather
 * than argued with.
 *
 * Nothing is composed in the browser. Every line is a string the server put in
 * the brief.
 */
export function SceneProjectBrief({
  sceneId,
  projectId,
  projectName,
  blocked = null,
  onLinkStatusChange,
}: {
  sceneId: number
  projectId: number | null
  projectName: string | null
  /**
   * Why linking is refused right now, or null when it is allowed. Set while the
   * editor's draft is dirty: linking is a server write that moves the scene's
   * revision, and the draft the user is holding was opened against the old one,
   * so a save afterwards is refused as a conflict with nothing to reconcile it.
   */
  blocked?: string | null
  /**
   * Reports the link write's state to whoever owns the editor around this
   * control.
   *
   * The block above is one direction of a two-way exclusion and on its own it is
   * only half a fix. Linking moves the scene's revision, and the editor reseeds
   * its draft from a new revision only while the draft is clean - so an edit made
   * DURING the link leaves the draft dirty at the old revision, the reseed is
   * skipped, and the next save is refused as a conflict over a revision the user
   * never saw. The editor needs to know this is happening to hold edits until the
   * refetch has landed.
   *
   * The full status, not just "in flight": a link that FAILED invalidates
   * nothing, so the refetch the editor is holding for never comes. Reporting only
   * the pending bit left the editor waiting for it forever, read-only until the
   * tab was closed.
   */
  onLinkStatusChange?: (status: ProjectLinkStatus) => void
}): JSX.Element {
  const panel = useRef<OverlayPanel>(null)
  // Only fetched once the user asks, and then kept. A scene editor that pulled
  // every linked project's brief on open would pay for a panel most sessions
  // never expand.
  const [requested, setRequested] = useState(false)
  const { data: brief, isLoading } = useProjectBriefQuery({
    projectId: projectId ?? 0,
    queryConfig: { enabled: requested && projectId !== null },
  })
  const { data: projects = [] } = useProjectsQuery({
    queryConfig: { enabled: requested },
  })
  const link = useSetSceneProjectMutation()

  // Reported rather than lifted wholesale: the mutation and its options belong
  // with the control that offers it, and the editor only needs to know how it is
  // going. React Query's own status is passed straight through - reducing it to
  // a boolean here is what lost the difference between "finished" and "failed".
  useEffect(() => {
    onLinkStatusChange?.(link.status)
  }, [link.status, onLinkStatusChange])

  return (
    <>
      <Button
        className="scene-project-chip"
        label={
          projectName ??
          (projectId === null ? 'No project' : `Project ${projectId}`)
        }
        icon="pi pi-folder"
        text
        size="small"
        data-testid="scene-project-chip"
        aria-label="Project brief"
        tooltip="What the agent was told about this project"
        onClick={event => {
          setRequested(true)
          panel.current?.toggle(event)
        }}
      />

      <OverlayPanel ref={panel} className="scene-project-brief">
        <h4>Project brief</h4>
        <p className="scene-project-brief-note">
          Verbatim what the agent is given.
        </p>

        {/*
          Linking is a scene write - the revision moves and it is undoable -
          because the project decides what the agent searches for and what
          validate_scene measures the scene against. It is a decision, not a
          label, so it is changed deliberately here rather than inline.

          And, like every other direct server write the editor offers, it is
          refused while the draft is dirty: it moves the revision the unsaved
          draft was opened against, and the editor has no way to merge the two.
        */}
        <Dropdown
          className="scene-project-brief-select"
          value={projectId}
          options={[
            { label: 'No project', value: null },
            ...projects.map(project => ({
              label: project.name,
              value: project.id,
            })),
          ]}
          disabled={link.isPending || blocked !== null}
          data-testid="scene-project-select"
          ariaLabel="Project this scene belongs to"
          onChange={event =>
            link.mutate({ sceneId, projectId: event.value ?? null })
          }
        />

        {blocked ? (
          <p
            className="scene-project-brief-note"
            data-testid="scene-project-blocked"
          >
            {blocked}
          </p>
        ) : null}

        {/*
          A refused link used to be silent: the dropdown snapped back to the
          project the scene still has, and nothing said why. The server's own
          reason is shown verbatim, and the control above is left enabled -
          picking again IS the retry, and the write moved nothing, so there is
          nothing to reconcile first.
        */}
        {link.isError ? (
          <p
            className="scene-project-brief-error"
            role="alert"
            data-testid="scene-project-error"
          >
            {link.error instanceof ApiClientError
              ? link.error.message
              : 'The project could not be changed.'}{' '}
            Pick a project again to retry.
          </p>
        ) : null}

        {projectId === null ? (
          <p
            className="scene-project-brief-note"
            data-testid="scene-project-brief-unlinked"
          >
            This scene belongs to no project, so the agent is given no budget,
            style or world convention to work to.
          </p>
        ) : isLoading || !Array.isArray(brief?.guidance) ? (
          <p className="scene-project-brief-note">Loading…</p>
        ) : brief.guidance.length === 0 ? (
          <p
            className="scene-project-brief-note"
            data-testid="scene-project-brief-empty"
          >
            This project&apos;s profile says nothing yet, so the agent is given
            nothing to go on.
          </p>
        ) : (
          <ul data-testid="scene-project-brief-guidance">
            {brief.guidance.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </OverlayPanel>
    </>
  )
}
