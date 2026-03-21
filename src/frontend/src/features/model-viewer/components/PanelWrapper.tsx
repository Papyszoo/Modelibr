import './PanelWrapper.css'

import { type ReactNode } from 'react'

export type PanelSide = 'left' | 'right' | 'top' | 'bottom'

export interface ExpandAction {
  direction: 'left' | 'right' | 'up' | 'down'
  tooltip: string
  onClick: () => void
}

interface PanelWrapperProps {
  title: string
  side: PanelSide
  onClose: () => void
  expandActions?: ExpandAction[]
  children: ReactNode
}

const EXPAND_ICONS: Record<string, string> = {
  left: 'pi pi-chevron-left',
  right: 'pi pi-chevron-right',
  up: 'pi pi-chevron-up',
  down: 'pi pi-chevron-down',
}

export function PanelWrapper({
  title,
  side,
  onClose,
  expandActions,
  children,
}: PanelWrapperProps) {
  return (
    <div className={`panel-wrapper panel-wrapper-${side}`}>
      <div className="panel-wrapper-header">
        <div className="panel-wrapper-expand-left">
          {expandActions
            ?.filter(a => a.direction === 'left' || a.direction === 'up')
            .map(action => (
              <button
                key={action.direction}
                className="panel-expand-btn"
                onClick={action.onClick}
                title={action.tooltip}
              >
                <i className={EXPAND_ICONS[action.direction]} />
              </button>
            ))}
        </div>
        <span className="panel-wrapper-title">{title}</span>
        <div className="panel-wrapper-actions">
          {expandActions
            ?.filter(a => a.direction === 'right' || a.direction === 'down')
            .map(action => (
              <button
                key={action.direction}
                className="panel-expand-btn"
                onClick={action.onClick}
                title={action.tooltip}
              >
                <i className={EXPAND_ICONS[action.direction]} />
              </button>
            ))}
          <button
            className="panel-close-btn"
            onClick={onClose}
            title={`Close ${title}`}
          >
            <i className="pi pi-times" />
          </button>
        </div>
      </div>
      <div className="panel-wrapper-content">{children}</div>
    </div>
  )
}
