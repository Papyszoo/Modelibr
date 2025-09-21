import axios from 'axios'

class ApiClient {
  constructor() {
    this.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5009'
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  async uploadModel(file) {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await this.client.post('/models', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    
    return response.data
  }

  async getModels() {
    const response = await this.client.get('/models')
    return response.data
  }

  getModelFileUrl(modelId) {
    return `${this.baseURL}/models/${modelId}/file`
  }

  getFileUrl(fileId) {
    return `${this.baseURL}/files/${fileId}`
  }
}

export default new ApiClient()