import { useState, useEffect, useRef } from 'react'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Toast } from 'primereact/toast'
import ApiClient from '../../../services/ApiClient'
import { ProjectDto } from '../../../types'
import { useTabContext } from '../../../hooks/useTabContext'
import { TOAST_LIFE_MS, DIALOG_WIDTH_MD } from '../../../utils/constants'
import './ProjectList.css'

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const toast = useRef<Toast>(null)
  const { openTab } = useTabContext()

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const data = await ApiClient.getAllProjects()
      setProjects(data)
    } catch (error) {
      console.error('Failed to load projects:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load projects',
        life: TOAST_LIFE_MS,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validation Error',
        detail: 'Project name is required',
        life: TOAST_LIFE_MS,
      })
      return
    }

    try {
      await ApiClient.createProject({
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
      })

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Project created successfully',
        life: TOAST_LIFE_MS,
      })

      setShowCreateDialog(false)
      setNewProjectName('')
      setNewProjectDescription('')
      loadProjects()
    } catch (error) {
      console.error('Failed to create project:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create project',
        life: TOAST_LIFE_MS,
      })
    }
  }

  const handleDeleteProject = async (projectId: number) => {
    try {
      await ApiClient.deleteProject(projectId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Project deleted successfully',
        life: TOAST_LIFE_MS,
      })
      loadProjects()
    } catch (error) {
      console.error('Failed to delete project:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete project',
        life: TOAST_LIFE_MS,
      })
    }
  }

  const getProjectThumbnail = (project: ProjectDto) => {
    // TODO: Add project thumbnail support
    // For now, return null - will be implemented when thumbnail upload is added
    return null
  }

  return (
    <div className="project-list">
      <Toast ref={toast} />

      <div className="project-list-header">
        <h2>Projects</h2>
        <Button
          label="Create Project"
          icon="pi pi-plus"
          onClick={() => setShowCreateDialog(true)}
        />
      </div>

      {loading ? (
        <div className="project-list-loading">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }} />
          <p>Loading projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="project-list-empty">
          <i className="pi pi-box" style={{ fontSize: '3rem' }} />
          <h3>No Projects Yet</h3>
          <p>Create your first project to organize models and texture sets</p>
          <Button
            label="Create Project"
            icon="pi pi-plus"
            onClick={() => setShowCreateDialog(true)}
          />
        </div>
      ) : (
        <div className="project-grid">
          {projects.map(project => {
            const thumbnail = getProjectThumbnail(project)
            return (
              <div
                key={project.id}
                className="project-grid-card"
                onClick={() => {
                  openTab('projectViewer', project.name, {
                    id: project.id.toString(),
                  })
                }}
              >
                <div className="project-grid-card-image">
                  {thumbnail ? (
                    <img src={thumbnail} alt={project.name} />
                  ) : (
                    <div className="project-grid-card-placeholder">
                      <i className="pi pi-box" />
                    </div>
                  )}
                </div>
                <div className="project-grid-card-content">
                  <h3 className="project-grid-card-title">{project.name}</h3>
                  {project.description && (
                    <p className="project-grid-card-description">
                      {project.description}
                    </p>
                  )}
                  <div className="project-grid-card-stats">
                    <span>
                      <i className="pi pi-cube" /> {project.modelCount}
                    </span>
                    <span>
                      <i className="pi pi-palette" /> {project.textureSetCount}
                    </span>
                    <span>
                      <i className="pi pi-image" /> {project.spriteCount}
                    </span>
                  </div>
                </div>
                <div className="project-grid-card-actions">
                  <Button
                    icon="pi pi-trash"
                    className="p-button-text p-button-rounded p-button-danger p-button-sm"
                    tooltip="Delete Project"
                    onClick={e => {
                      e.stopPropagation()
                      handleDeleteProject(project.id)
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog
        header="Create New Project"
        visible={showCreateDialog}
        style={{ width: DIALOG_WIDTH_MD }}
        onHide={() => {
          setShowCreateDialog(false)
          setNewProjectName('')
          setNewProjectDescription('')
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                setShowCreateDialog(false)
                setNewProjectName('')
                setNewProjectDescription('')
              }}
              className="p-button-text"
            />
            <Button
              label="Create"
              icon="pi pi-check"
              onClick={handleCreateProject}
              autoFocus
            />
          </div>
        }
      >
        <div className="p-fluid">
          <div className="field">
            <label htmlFor="project-name">Name *</label>
            <InputText
              id="project-name"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              placeholder="Enter project name"
            />
          </div>
          <div className="field">
            <label htmlFor="project-description">Description</label>
            <InputTextarea
              id="project-description"
              value={newProjectDescription}
              onChange={e => setNewProjectDescription(e.target.value)}
              rows={3}
              placeholder="Enter project description (optional)"
            />
          </div>
        </div>
      </Dialog>
    </div>
  )
}
