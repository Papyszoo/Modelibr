import { useState, useEffect } from 'react'
import { Button } from 'primereact/button'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputNumber } from 'primereact/inputnumber'
import { Dropdown } from 'primereact/dropdown'
import { Checkbox } from 'primereact/checkbox'
import { InputTextarea } from 'primereact/inputtextarea'
// eslint-disable-next-line no-restricted-imports
import ApiClient, { EnvironmentDto } from '../services/ApiClient'

const ENVIRONMENT_PRESETS = [
  { label: 'City', value: 'city' },
  { label: 'Dawn', value: 'dawn' },
  { label: 'Forest', value: 'forest' },
  { label: 'Lobby', value: 'lobby' },
  { label: 'Night', value: 'night' },
  { label: 'Park', value: 'park' },
  { label: 'Studio', value: 'studio' },
  { label: 'Sunset', value: 'sunset' },
  { label: 'Warehouse', value: 'warehouse' },
]

interface EnvironmentFormData {
  name: string
  description: string
  lightIntensity: number
  environmentPreset: string
  showShadows: boolean
  isDefault: boolean
}

function EnvironmentsManager(): JSX.Element {
  const [environments, setEnvironments] = useState<EnvironmentDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingEnvironment, setEditingEnvironment] = useState<EnvironmentDto | null>(null)
  const [formData, setFormData] = useState<EnvironmentFormData>({
    name: '',
    description: '',
    lightIntensity: 0.5,
    environmentPreset: 'city',
    showShadows: true,
    isDefault: false,
  })

  useEffect(() => {
    fetchEnvironments()
  }, [])

  const fetchEnvironments = async () => {
    setIsLoading(true)
    try {
      const data = await ApiClient.getEnvironments()
      setEnvironments(data)
    } catch (error) {
      console.error('Failed to load environments:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingEnvironment(null)
    setFormData({
      name: '',
      description: '',
      lightIntensity: 0.5,
      environmentPreset: 'city',
      showShadows: true,
      isDefault: false,
    })
    setShowDialog(true)
  }

  const handleEdit = (env: EnvironmentDto) => {
    setEditingEnvironment(env)
    setFormData({
      name: env.name,
      description: env.description || '',
      lightIntensity: env.lightIntensity,
      environmentPreset: env.environmentPreset,
      showShadows: env.showShadows,
      isDefault: env.isDefault,
    })
    setShowDialog(true)
  }

  const handleSave = async () => {
    try {
      if (editingEnvironment) {
        await ApiClient.updateEnvironment(editingEnvironment.id, {
          name: formData.name,
          description: formData.description || undefined,
          lightIntensity: formData.lightIntensity,
          environmentPreset: formData.environmentPreset,
          showShadows: formData.showShadows,
          shadowType: formData.showShadows ? 'contact' : undefined,
          shadowOpacity: 0.4,
          shadowBlur: 2,
        })
      } else {
        await ApiClient.createEnvironment({
          name: formData.name,
          description: formData.description || undefined,
          lightIntensity: formData.lightIntensity,
          environmentPreset: formData.environmentPreset,
          showShadows: formData.showShadows,
          isDefault: formData.isDefault,
        })
      }
      setShowDialog(false)
      fetchEnvironments()
    } catch (error) {
      console.error('Failed to save environment:', error)
    }
  }

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this environment?')) {
      try {
        await ApiClient.deleteEnvironment(id)
        fetchEnvironments()
      } catch (error) {
        console.error('Failed to delete environment:', error)
      }
    }
  }

  const handleSetDefault = async (id: number) => {
    try {
      await ApiClient.setDefaultEnvironment(id)
      fetchEnvironments()
    } catch (error) {
      console.error('Failed to set default environment:', error)
    }
  }

  const actionBodyTemplate = (rowData: EnvironmentDto) => {
    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button
          icon="pi pi-pencil"
          size="small"
          onClick={() => handleEdit(rowData)}
        />
        {!rowData.isDefault && (
          <>
            <Button
              icon="pi pi-star"
              size="small"
              onClick={() => handleSetDefault(rowData.id)}
              tooltip="Set as default"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              severity="danger"
              onClick={() => handleDelete(rowData.id)}
            />
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2>Environments</h2>
        <Button label="Create Environment" icon="pi pi-plus" onClick={handleCreate} />
      </div>

      <DataTable value={environments} loading={isLoading}>
        <Column field="name" header="Name" />
        <Column field="description" header="Description" />
        <Column field="environmentPreset" header="Preset" />
        <Column
          field="isDefault"
          header="Default"
          body={(rowData: EnvironmentDto) => (rowData.isDefault ? 'Yes' : 'No')}
        />
        <Column body={actionBodyTemplate} header="Actions" />
      </DataTable>

      <Dialog
        header={editingEnvironment ? 'Edit Environment' : 'Create Environment'}
        visible={showDialog}
        style={{ width: '500px' }}
        onHide={() => setShowDialog(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="name">Name</label>
            <InputText
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label htmlFor="description">Description</label>
            <InputTextarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={{ width: '100%' }}
              rows={3}
            />
          </div>

          <div>
            <label htmlFor="preset">Environment Preset</label>
            <Dropdown
              id="preset"
              value={formData.environmentPreset}
              options={ENVIRONMENT_PRESETS}
              onChange={(e) => setFormData({ ...formData, environmentPreset: e.value })}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label htmlFor="intensity">Light Intensity</label>
            <InputNumber
              id="intensity"
              value={formData.lightIntensity}
              onValueChange={(e) => setFormData({ ...formData, lightIntensity: e.value || 0.5 })}
              mode="decimal"
              minFractionDigits={1}
              maxFractionDigits={1}
              min={0}
              max={10}
              step={0.1}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Checkbox
              inputId="shadows"
              checked={formData.showShadows}
              onChange={(e) => setFormData({ ...formData, showShadows: e.checked || false })}
            />
            <label htmlFor="shadows">Show Shadows</label>
          </div>

          {!editingEnvironment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Checkbox
                inputId="default"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.checked || false })}
              />
              <label htmlFor="default">Set as Default</label>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <Button label="Cancel" severity="secondary" onClick={() => setShowDialog(false)} />
            <Button label="Save" onClick={handleSave} />
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default EnvironmentsManager
