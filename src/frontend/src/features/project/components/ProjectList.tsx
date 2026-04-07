import './ProjectList.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { InputSwitch } from 'primereact/inputswitch'
import { Toast } from 'primereact/toast'
import { useState } from 'react'
import { useRef } from 'react'

import { deleteProject } from '@/features/project/api/projectApi'
import { useProjectsQuery } from '@/features/project/api/queries'
import { useTabContext } from '@/hooks/useTabContext'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
import { FilterPanel } from '@/shared/components/FilterPanel'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { type ProjectDto } from '@/types'

import { CreateProjectDialog } from './CreateProjectDialog'

export function ProjectList() {
  const queryClient = useQueryClient()
  const projectsQuery = useProjectsQuery()
  const projects = projectsQuery.data ?? []
  const loading = projectsQuery.isLoading
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [onlyWithConceptArt, setOnlyWithConceptArt] = useState(false)
  const toast = useRef<Toast>(null)
  const { openProjectDetailsTab } = useTabContext()

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

  const filteredProjects = projects.filter(project => {
    const matchesSearch =
      searchQuery.trim().length === 0 ||
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description ?? '')
        .toLowerCase()
        .includes(searchQuery.toLowerCase())

    const matchesConcept = !onlyWithConceptArt || project.conceptImageCount > 0
    return matchesSearch && matchesConcept
  })

  const activeFilterCount = [
    searchQuery.trim().length > 0,
    onlyWithConceptArt,
  ].filter(Boolean).length

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

      <FilterPanel
        activeCount={activeFilterCount}
        summaryLabel="Project Filters"
      >
        <div className="list-filters-search">
          <i className="pi pi-search" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search projects"
            className="list-filters-search-input"
          />
        </div>

        <div className="list-filters-row">
          <div className="list-filters-switch">
            <InputSwitch
              checked={onlyWithConceptArt}
              onChange={e => setOnlyWithConceptArt(Boolean(e.value))}
            />
            <span>Concept art</span>
          </div>
          <CardWidthSlider
            value={cardWidth}
            min={200}
            max={500}
            onChange={width => setCardWidth('projects', width)}
          />
          {activeFilterCount > 0 ? (
            <Button
              icon="pi pi-times"
              className="p-button-text p-button-sm list-filters-clear"
              tooltip="Clear project filters"
              tooltipOptions={{ position: 'bottom' }}
              onClick={() => {
                setSearchQuery('')
                setOnlyWithConceptArt(false)
              }}
            />
          ) : null}
        </div>
      </FilterPanel>

      {loading ? (
        <div className="project-list-loading">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }} />
          <p>Loading projects...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="project-list-empty">
          <i className="pi pi-box" style={{ fontSize: '3rem' }} />
          <h3>No Matching Projects</h3>
          <p>Adjust the filters or create a new project.</p>
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
          {filteredProjects.map(project => {
            const thumbnail = resolveApiAssetUrl(project.customThumbnailUrl)
            return (
              <div
                key={project.id}
                className="project-grid-card"
                data-project-id={project.id}
                onClick={() => {
                  openProjectDetailsTab(project.id.toString())
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
                  {project.notes && (
                    <p className="project-grid-card-description">
                      {project.notes}
                    </p>
                  )}
                  <div className="project-grid-card-stats">
                    <span>
                      <i className="pi pi-box" /> {project.modelCount}
                    </span>
                    <span>
                      <i className="pi pi-palette" /> {project.textureSetCount}
                    </span>
                    <span>
                      <i className="pi pi-image" /> {project.spriteCount}
                    </span>
                    <span>
                      <i className="pi pi-volume-up" /> {project.soundCount}
                    </span>
                    <span>
                      <i className="pi pi-images" /> {project.conceptImageCount}
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
