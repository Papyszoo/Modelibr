import { useState } from 'react'
import './App.css'

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const handleFileSelect = (event) => {
    setSelectedFile(event.target.files[0])
    setUploadStatus('')
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadStatus('Please select a file first')
      return
    }

    setIsUploading(true)
    setUploadStatus('Uploading...')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      // Assuming the WebAPI is available on port 8080 as configured in docker-compose
      const response = await fetch('http://localhost:8080/uploadModel', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()
        setUploadStatus(`Upload successful! File ID: ${result.id || 'Generated'}`)
      } else {
        setUploadStatus(`Upload failed: ${response.statusText}`)
      }
    } catch (error) {
      setUploadStatus(`Upload error: ${error.message}`)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Modelibr</h1>
        <p>3D Model File Upload Service</p>
      </header>
      
      <main className="upload-section">
        <div className="upload-form">
          <h2>Upload 3D Model</h2>
          
          <div className="file-input-container">
            <input
              type="file"
              id="file-input"
              onChange={handleFileSelect}
              accept=".obj,.fbx,.dae,.3ds,.blend,.gltf,.glb"
              disabled={isUploading}
            />
            <label htmlFor="file-input" className="file-input-label">
              {selectedFile ? selectedFile.name : 'Choose 3D model file...'}
            </label>
          </div>

          <button 
            onClick={handleUpload} 
            disabled={!selectedFile || isUploading}
            className="upload-button"
          >
            {isUploading ? 'Uploading...' : 'Upload Model'}
          </button>

          {uploadStatus && (
            <div className={`status-message ${uploadStatus.includes('successful') ? 'success' : 'error'}`}>
              {uploadStatus}
            </div>
          )}
        </div>

        <div className="info-section">
          <h3>Supported File Types</h3>
          <ul>
            <li>.obj - Wavefront OBJ</li>
            <li>.fbx - Autodesk FBX</li>
            <li>.dae - COLLADA</li>
            <li>.3ds - 3D Studio Max</li>
            <li>.blend - Blender</li>
            <li>.gltf/.glb - GL Transmission Format</li>
          </ul>
        </div>
      </main>
    </div>
  )
}

export default App
