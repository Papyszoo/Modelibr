import './SelectContainerDialog.css'

import { Dialog } from 'primereact/dialog'

import { useProjectsQuery } from '@/features/project/api/queries'

interface SelectProjectDialogProps {
  visible: boolean
  onHide: () => void
  onSelect: (projectId: number) => void
  header?: string
}

export function SelectProjectDialog({
  visible,
  onHide,
  onSelect,
  header = 'Add to Project',
}: SelectProjectDialogProps) {
  const { data: projects = [], isLoading } = useProjectsQuery({
    queryConfig: { enabled: visible },
  })

  return (
    <Dialog
      header={header}
      visible={visible}
      style={{ width: '500px' }}
      onHide={onHide}
    >
      <div className="container-selection-dialog">
        <p>Select a project:</p>
        {isLoading ? (
          <p>Loading projects...</p>
        ) : projects.length === 0 ? (
          <div className="container-select-empty">
            <i className="pi pi-inbox" />
            <p>No projects available. Create a project first.</p>
          </div>
        ) : (
          <div className="container-select-list">
            {projects.map(project => (
              <div
                key={project.id}
                className="container-select-item"
                onClick={() => onSelect(project.id)}
              >
                <i className="pi pi-folder" />
                <div className="container-select-item-content">
                  <span className="container-select-item-name">
                    {project.name}
                  </span>
                  {project.description && (
                    <span className="container-select-item-description">
                      {project.description}
                    </span>
                  )}
                </div>
                <i className="pi pi-chevron-right" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}
