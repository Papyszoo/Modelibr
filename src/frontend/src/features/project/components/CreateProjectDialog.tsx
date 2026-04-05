import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { type z } from 'zod'

import { createProject } from '@/features/project/api/projectApi'
import { projectCreateFormSchema } from '@/shared/validation/formSchemas'

type ProjectCreateFormInput = z.input<typeof projectCreateFormSchema>
type ProjectCreateFormOutput = z.output<typeof projectCreateFormSchema>

interface CreateProjectDialogProps {
  visible: boolean
  onHide: () => void
}

export function CreateProjectDialog({
  visible,
  onHide,
}: CreateProjectDialogProps) {
  const queryClient = useQueryClient()
  const toast = useRef<Toast>(null)

  const { register, handleSubmit, reset } = useForm<
    ProjectCreateFormInput,
    unknown,
    ProjectCreateFormOutput
  >({
    resolver: zodResolver(projectCreateFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      notes: '',
    },
  })

  const createProjectMutation = useMutation({
    mutationFn: (payload: {
      name: string
      description?: string
      notes?: string
    }) => createProject(payload),
    onSuccess: async () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Project created successfully',
        life: 3000,
      })

      onHide()
      reset({ name: '', description: '', notes: '' })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: error => {
      console.error('Failed to create project:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create project',
        life: 3000,
      })
    },
  })

  const handleCreateProject = handleSubmit(
    async values => {
      await createProjectMutation.mutateAsync(values)
    },
    () => {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validation Error',
        detail: 'Project name is required',
        life: 3000,
      })
    }
  )

  const handleHide = () => {
    onHide()
    reset({ name: '', description: '', notes: '' })
  }

  return (
    <>
      <Toast ref={toast} />
      <Dialog
        header="Create New Project"
        visible={visible}
        style={{ width: '500px' }}
        onHide={handleHide}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={handleHide}
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
              {...register('name')}
              placeholder="Enter project name"
            />
          </div>
          <div className="field">
            <label htmlFor="project-description">Description</label>
            <InputTextarea
              id="project-description"
              {...register('description')}
              rows={3}
              placeholder="Enter project description (optional)"
            />
          </div>
          <div className="field">
            <label htmlFor="project-notes">Notes</label>
            <InputTextarea
              id="project-notes"
              {...register('notes')}
              rows={4}
              placeholder="Planning notes, art references, TODOs"
            />
          </div>
        </div>
      </Dialog>
    </>
  )
}
