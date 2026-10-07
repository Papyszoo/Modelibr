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

/**
 * The Level workspace's four questions. A different vocabulary from the Project's
 * four, over the same control.
 */
export type ProjectLevelView = 'overview' | 'assets' | 'scenes' | 'references'

export interface WorkspaceViewDescriptor<T extends string> {
  id: T
  label: string
  icon: string
}

const PROJECT_VIEWS: Array<WorkspaceViewDescriptor<ProjectWorkspaceView>> = [
  { id: 'overview', label: 'Overview', icon: 'pi pi-info-circle' },
  { id: 'levels', label: 'Levels', icon: 'pi pi-map' },
  { id: 'cast', label: 'Cast', icon: 'pi pi-users' },
  { id: 'references', label: 'References', icon: 'pi pi-images' },
]

interface ProjectWorkspaceShellProps<T extends string> {
  view: T
  onViewChange: (view: T) => void
  counts: Partial<Record<T, number>>
  /**
   * The selected view's content. Typed as a node rather than a single element:
   * every view renders more than one surface, and a `JSX.Element` prop would force
   * a pointless wrapper `<div>` around each one.
   */
  children: ReactNode
  /**
   * Which set of views to show. Defaults to the Project's, and the Level
   * workspace passes its own.
   *
   * One control, two vocabularies, rather than a second navigation component that
   * would drift from the first in spacing, count badges and selection styling.
   */
  views?: Array<WorkspaceViewDescriptor<T>>
  /** Accessible name for the tab list; distinguishes the two workspaces. */
  label?: string
  /**
   * `Project / Forest Crossing` above the view bar, when this workspace is a
   * drill-down inside another one. A Level is part of Project design rather than
   * an asset in its own right, so it is reached through the Project tab instead
   * of getting a tab of its own - and the breadcrumb is what says so.
   */
  breadcrumb?: ReactNode
}

export function ProjectWorkspaceShell<T extends string>({
  view,
  onViewChange,
  counts,
  children,
  views = PROJECT_VIEWS as unknown as Array<WorkspaceViewDescriptor<T>>,
  label = 'Project workspace',
  breadcrumb,
}: ProjectWorkspaceShellProps<T>) {
  return (
    <div className="project-workspace" data-testid="project-workspace">
      {breadcrumb}
      <div className="project-workspace-nav" role="tablist" aria-label={label}>
        {views.map(entry => {
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
        aria-label={views.find(entry => entry.id === view)?.label}
      >
        {children}
      </div>
    </div>
  )
}
