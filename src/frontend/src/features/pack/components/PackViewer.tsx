import { useState, useEffect, useRef } from 'react'
import { Card } from 'primereact/card'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import ApiClient from '../../../services/ApiClient'
import { PackDto, Model, TextureSetDto } from '../../../types'
import './PackViewer.css'

interface PackViewerProps {
  packId: number
}

export default function PackViewer({ packId }: PackViewerProps) {
  const [pack, setPack] = useState<PackDto | null>(null)
  const [models, setModels] = useState<Model[]>([])
  const [textureSets, setTextureSets] = useState<TextureSetDto[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useRef<Toast>(null)

  useEffect(() => {
    loadPack()
    loadPackContent()
  }, [packId])

  const loadPack = async () => {
    try {
      const data = await ApiClient.getPackById(packId)
      setPack(data)
    } catch (error) {
      console.error('Failed to load pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load pack',
        life: 3000,
      })
    }
  }

  const loadPackContent = async () => {
    try {
      setLoading(true)
      const [modelsData, textureSetsData] = await Promise.all([
        ApiClient.getModelsByPack(packId),
        ApiClient.getTextureSetsByPack(packId),
      ])
      setModels(modelsData)
      setTextureSets(textureSetsData)
    } catch (error) {
      console.error('Failed to load pack content:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load pack content',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveModel = async (modelId: number) => {
    try {
      await ApiClient.removeModelFromPack(packId, modelId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Model removed from pack',
        life: 3000,
      })
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to remove model:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to remove model from pack',
        life: 3000,
      })
    }
  }

  const handleRemoveTextureSet = async (textureSetId: number) => {
    try {
      await ApiClient.removeTextureSetFromPack(packId, textureSetId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set removed from pack',
        life: 3000,
      })
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to remove texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to remove texture set from pack',
        life: 3000,
      })
    }
  }

  const modelActionTemplate = (rowData: Model) => {
    return (
      <Button
        icon="pi pi-times"
        className="p-button-text p-button-rounded p-button-danger p-button-sm"
        tooltip="Remove from pack"
        onClick={() => handleRemoveModel(rowData.id)}
      />
    )
  }

  const textureSetActionTemplate = (rowData: TextureSetDto) => {
    return (
      <Button
        icon="pi pi-times"
        className="p-button-text p-button-rounded p-button-danger p-button-sm"
        tooltip="Remove from pack"
        onClick={() => handleRemoveTextureSet(rowData.id)}
      />
    )
  }

  if (!pack) {
    return <div>Loading...</div>
  }

  return (
    <div className="pack-viewer">
      <Toast ref={toast} />
      
      <div className="pack-header">
        <div>
          <h2>{pack.name}</h2>
          {pack.description && <p className="pack-description">{pack.description}</p>}
        </div>
        <div className="pack-stats">
          <span>{pack.modelCount} models</span>
          <span>{pack.textureSetCount} texture sets</span>
        </div>
      </div>

      <div className="pack-content">
        <Card title="Models" className="pack-section">
          <DataTable
            value={models}
            loading={loading}
            emptyMessage="No models in this pack"
            responsiveLayout="scroll"
            stripedRows
          >
            <Column field="name" header="Name" sortable />
            <Column
              field="createdAt"
              header="Created"
              sortable
              body={(rowData) => new Date(rowData.createdAt).toLocaleDateString()}
            />
            <Column body={modelActionTemplate} header="Actions" style={{ width: '80px' }} />
          </DataTable>
        </Card>

        <Card title="Texture Sets" className="pack-section">
          <DataTable
            value={textureSets}
            loading={loading}
            emptyMessage="No texture sets in this pack"
            responsiveLayout="scroll"
            stripedRows
          >
            <Column field="name" header="Name" sortable />
            <Column field="textureCount" header="Textures" sortable />
            <Column
              field="createdAt"
              header="Created"
              sortable
              body={(rowData) => new Date(rowData.createdAt).toLocaleDateString()}
            />
            <Column body={textureSetActionTemplate} header="Actions" style={{ width: '80px' }} />
          </DataTable>
        </Card>
      </div>
    </div>
  )
}
