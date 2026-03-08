import './ProjectList.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { useState } from 'react'
import { useRef } from 'react'

import { deleteProject } from '@/features/project/api/projectApi'
import { useProjectsQuery } from '@/features/project/api/queries'
import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { type ProjectDto } from '@/types'
import { openTabInPanel } from '@/utils/tabNavigation'

import { CreateProjectDialog } from './CreateProjectDialog'

export function ProjectList() {
  const queryClient = useQueryClient()
  const projectsQuery = useProjectsQuery()
  const projects = projectsQuery.data ?? []
  const loading = projectsQuery.isLoading
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const toast = useRef<Toast>(null)

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.projects

  const invalidateProjects = async () => {
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: number) => deleteProject(projectId),
    onMutate: async projectId => {
      await queryClient.cancelQueries({ queryKey: ['projects'] })
      const previousProjects = queryClient.getQueryData<ProjectDto[]>([
        'projects',
      ])
      queryClient.setQueryData<ProjectDto[]>(['projects'], current =>
        (current ?? []).filter(p => p.id !== projectId)
      )
      return { previousProjects }
    },
    onError: (error, _projectId, context) => {
      console.error('Failed to delete project:', error)
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects)
      }
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete project',
        life: 3000,
      })
    },
    onSuccess: () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Project deleted successfully',
        life: 3000,
      })
    },
    onSettled: async () => {
      await invalidateProjects()
    },
  })

  const handleDeleteProject = async (projectId: number) => {
    await deleteProjectMutation.mutateAsync(projectId)
  }

  const getProjectThumbnail = (_project: ProjectDto) => {
    // TODO: Add project thumbnail support
    // For now, return null - will be implemented when thumbnail upload is added
    return null
  }

  return (
    <div className="project-list">
      <Toast ref={toast} />

      <div className="project-list-header">
        <h2>Projects</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <CardWidthSlider
            value={cardWidth}
            min={200}
            max={500}
            onChange={width => setCardWidth('projects', width)}
          />
          <Button
            label="Create Project"
            icon="pi pi-plus"
            onClick={() => setShowCreateDialog(true)}
          />
        </div>
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
        <div
          className="project-grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
          }}
        >
          {projects.map(project => {
            const thumbnail = getProjectThumbnail(project)
            return (
              <div
                key={project.id}
                className="project-grid-card"
                onClick={() => {
                  openTabInPanel(
                    'projectViewer',
                    'left',
                    project.id.toString(),
                    project.name
                  )
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
                    disabled={deleteProjectMutation.isPending}
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

      <CreateProjectDialog
        visible={showCreateDialog}
        onHide={() => setShowCreateDialog(false)}
      />
    </div>
  )
}
