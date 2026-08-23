import './SceneProjectBrief.css'

import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { type JSX, useRef, useState } from 'react'

import { useProjectBriefQuery } from '@/features/project/api/queries'

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
  projectId,
  projectName,
}: {
  projectId: number
  projectName: string | null
}): JSX.Element {
  const panel = useRef<OverlayPanel>(null)
  // Only fetched once the user asks, and then kept. A scene editor that pulled
  // every linked project's brief on open would pay for a panel most sessions
  // never expand.
  const [requested, setRequested] = useState(false)
  const { data: brief, isLoading } = useProjectBriefQuery({
    projectId,
    queryConfig: { enabled: requested },
  })

  return (
    <>
      <Button
        className="scene-project-chip"
        label={projectName ?? `Project ${projectId}`}
        icon="pi pi-folder"
        text
        size="small"
        data-testid="scene-project-chip"
        aria-label={`Project brief for ${projectName ?? projectId}`}
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

        {isLoading || !brief ? (
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
