import './SceneProjectBrief.css'

import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { OverlayPanel } from 'primereact/overlaypanel'
import { type JSX, useRef, useState } from 'react'

import { useProjectsQuery } from '@/features/project/api/queries'
import { useProjectBriefQuery } from '@/features/project/api/queries'
import { ApiClientError } from '@/lib/apiBase'

import {
  isDefiniteLinkRefusal,
  useSetSceneProjectMutation,
} from '../api/queries'

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
}: {
  sceneId: number
  projectId: number | null
  projectName: string | null
  /**
   * Why linking is refused right now, or null when it is allowed. Set while the
   * editor's draft is dirty, while another direct scene write is in flight, and
   * while a previous link is still being serialised: linking is a server write
   * that moves the scene's revision, and anything else holding or carrying that
   * revision cannot be raced against it.
   *
   * <p>
   * The editor is NOT told about this write in return. It used to be - the
   * mutation's status was reported up through a callback - and the hold that
   * followed from it died with this component on every tab switch, could not
   * tell a refusal from a dropped connection, and threw away the revision the
   * server had just named. The hold is opened and settled by the mutation
   * itself now (`useSetSceneProjectMutation`), keyed by scene, so it survives
   * whatever happens to this panel.
   * </p>
   */
  blocked?: string | null
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
          onChange={event => {
            // Checked HERE, not only on the disabled attribute. A disabled
            // PrimeReact control still has a keyboard path, and the reason this
            // is refused is that the write would race another one - which is a
            // rule about the write, not about the styling. The two directions of
            // the exclusion have to be enforced in the same place or they are
            // one guard, not two.
            if (blocked !== null || link.isPending) {
              return
            }
            link.mutate({ sceneId, projectId: event.value ?? null })
          }}
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
          reason is shown verbatim.

          The advice that follows it depends on WHICH kind of failure it was, and
          they are not interchangeable. A refusal moved nothing, so picking again
          is the retry and the control stays live. A dropped connection may have
          committed - "try again" there is an invitation to link twice, so it says
          what is actually happening instead: the scene is being re-read, and the
          editor is held until it is known what was saved.
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
            {isDefiniteLinkRefusal(link.error)
              ? 'Pick a project again to retry.'
              : 'It is not known whether it was saved, so the scene is being re-read from the server.'}
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
