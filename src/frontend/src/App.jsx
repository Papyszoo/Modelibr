import { useState } from 'react'
import './App.css'
import ModelList from './ModelList'
import { useFileUpload } from './hooks/useFileUpload'

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [currentView, setCurrentView] = useState('models') // 'upload' or 'models'

  // Use the file upload hook for the upload page (no Three.js requirement)
  const { uploading: isUploading, uploadFile } = useFileUpload({
    requireThreeJSRenderable: false,
    onSuccess: (file, result) => {
      setUploadStatus(`Upload successful! File ID: ${result.value?.id || 'Generated'}`)
      setSelectedFile(null)
      // Reset file input
      const fileInput = document.getElementById('file-input')
      if (fileInput) fileInput.value = ''
    },
    onError: (file, error) => {
      if (error.type === 'UNSUPPORTED_FORMAT') {
        setUploadStatus(`Upload failed: ${error.message}`)
      } else {
        setUploadStatus(`Upload failed: ${error.message}`)
      }
    }
  })

  const handleFileSelect = (event) => {
    setSelectedFile(event.target.files[0])
    setUploadStatus('')
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadStatus('Please select a file first')
      return
    }

    setUploadStatus('Uploading...')

    try {
      await uploadFile(selectedFile)
    } catch (error) {
      // Error handling is done in the hook's onError callback
    }
  }

  const switchToModels = () => {
    setCurrentView('models')
  }

  const switchToUpload = () => {
    setCurrentView('upload')
  }

  if (currentView === 'models') {
    return <ModelList onBackToUpload={switchToUpload} />
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Modelibr</h1>
        <p>3D Model File Upload Service</p>
        
        <nav className="app-nav">
          <button 
            className={`nav-button ${currentView === 'upload' ? 'active' : ''}`}
            onClick={switchToUpload}
          >
            Upload
          </button>
          <button 
            className={`nav-button ${currentView === 'models' ? 'active' : ''}`}
            onClick={switchToModels}
          >
            View Models
          </button>
        </nav>
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
          
          {uploadStatus.includes('successful') && (
            <div className="post-upload-actions">
              <button onClick={switchToModels} className="view-models-button">
                View All Models
              </button>
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
          
          <h3>Features</h3>
          <ul>
            <li>✓ Hash-based file deduplication</li>
            <li>✓ Three.js TSL rendering</li>
            <li>✓ Interactive 3D model viewer</li>
            <li>✓ Real-time PBR materials</li>
          </ul>
        </div>
      </main>
    </div>
  )
}

export default App
