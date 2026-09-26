import './ProjectWorkspaceShell.css'

import { type ReactNode } from 'react'

/**
 * The Project workspace's own navigation: Overview, Levels, Cast, References.
 *
 * Why this exists rather than one long scrolling studio: the studio grew into
 * five production surfaces stacked in a column, and a user opening a Project to
 * answer "what is this level made of" had to scroll past the cast and the
 * reference board to get there. Each surface is a different question, so they get
 * one control each instead of one page.
 *
 * Deliberately NOT a dock tab. These are views inside the Project's tab, which
 * already has its own tab bar for asset families - a second nested tab bar would
 * compete with it for the same affordance.
 */
export type ProjectWorkspaceView = 'overview' | 'levels' | 'cast' | 'references'

interface ProjectWorkspaceShellProps {
  view: ProjectWorkspaceView
  onViewChange: (view: ProjectWorkspaceView) => void
  counts: Partial<Record<ProjectWorkspaceView, number>>
  /**
   * The selected view's content. Typed as a node rather than a single element:
   * every view renders more than one surface, and a `JSX.Element` prop would force
   * a pointless wrapper `<div>` around each one.
   */
  children: ReactNode
}

const VIEWS: Array<{
  id: ProjectWorkspaceView
  label: string
  icon: string
}> = [
  { id: 'overview', label: 'Overview', icon: 'pi pi-info-circle' },
  { id: 'levels', label: 'Levels', icon: 'pi pi-map' },
  { id: 'cast', label: 'Cast', icon: 'pi pi-users' },
  { id: 'references', label: 'References', icon: 'pi pi-images' },
]

export function ProjectWorkspaceShell({
  view,
  onViewChange,
  counts,
  children,
}: ProjectWorkspaceShellProps) {
  return (
    <div className="project-workspace" data-testid="project-workspace">
      <div
        className="project-workspace-nav"
        role="tablist"
        aria-label="Project workspace"
      >
        {VIEWS.map(entry => {
          const count = counts[entry.id]
          const selected = view === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`project-workspace-tab${selected ? ' is-active' : ''}`}
              data-testid={`project-workspace-tab-${entry.id}`}
              onClick={() => onViewChange(entry.id)}
            >
              <i className={entry.icon} aria-hidden="true" />
              <span>{entry.label}</span>
              {count !== undefined && count > 0 && (
                <span className="project-workspace-count">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      <div
        className="project-workspace-body"
        role="tabpanel"
        aria-label={VIEWS.find(entry => entry.id === view)?.label}
      >
        {children}
      </div>
    </div>
  )
}
