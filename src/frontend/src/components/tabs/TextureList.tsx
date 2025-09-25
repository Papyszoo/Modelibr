import { useState } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import './TextureList.css'

// Placeholder data for textures
const PLACEHOLDER_TEXTURES = [
  { id: 1, name: 'Wood_Texture.jpg', type: 'Diffuse', resolution: '1024x1024', format: 'JPEG' },
  { id: 2, name: 'Metal_Normal.png', type: 'Normal', resolution: '2048x2048', format: 'PNG' },
  { id: 3, name: 'Fabric_Roughness.exr', type: 'Roughness', resolution: '512x512', format: 'EXR' },
  { id: 4, name: 'Stone_Albedo.tiff', type: 'Albedo', resolution: '4096x4096', format: 'TIFF' },
]

function TextureList() {
  const [textures] = useState(PLACEHOLDER_TEXTURES)
  const [selectedTexture, setSelectedTexture] = useState(null)

  const actionBodyTemplate = (rowData) => {
    return (
      <div className="texture-actions">
        <Button 
          icon="pi pi-eye" 
          className="p-button-text p-button-rounded" 
          onClick={() => setSelectedTexture(rowData)}
          tooltip="View Texture"
        />
        <Button 
          icon="pi pi-download" 
          className="p-button-text p-button-rounded" 
          onClick={() => console.log('Download texture:', rowData.id)}
          tooltip="Download Texture"
        />
      </div>
    )
  }

  const typeBodyTemplate = (rowData) => {
    const typeColors = {
      'Diffuse': '#3b82f6',
      'Normal': '#10b981',
      'Roughness': '#f59e0b',
      'Albedo': '#ef4444'
    }
    
    return (
      <span 
        className="texture-type-badge"
        style={{ backgroundColor: typeColors[rowData.type] || '#6b7280' }}
      >
        {rowData.type}
      </span>
    )
  }

  return (
    <div className="texture-list">
      <header className="texture-list-header">
        <h1>Texture Library</h1>
        <div className="texture-stats">
          <span className="stat-item">
            <i className="pi pi-image"></i>
            {textures.length} textures
          </span>
        </div>
      </header>

      <div className="texture-list-content">
        <DataTable 
          value={textures}
          selection={selectedTexture}
          onSelectionChange={(e) => setSelectedTexture(e.value)}
          selectionMode="single"
          responsiveLayout="scroll"
          stripedRows
          showGridlines
          emptyMessage="No textures found"
        >
          <Column field="name" header="Name" sortable />
          <Column field="type" header="Type" body={typeBodyTemplate} sortable />
          <Column field="resolution" header="Resolution" sortable />
          <Column field="format" header="Format" sortable />
          <Column body={actionBodyTemplate} header="Actions" style={{ width: '120px' }} />
        </DataTable>
      </div>

      {selectedTexture && (
        <div className="texture-preview">
          <h3>Preview: {selectedTexture.name}</h3>
          <div className="texture-placeholder">
            <i className="pi pi-image" style={{ fontSize: '4rem', color: '#9ca3af' }}></i>
            <p>Texture preview would be displayed here</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default TextureList