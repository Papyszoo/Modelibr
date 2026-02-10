import axios from 'axios'

export const baseURL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

export const UPLOAD_TIMEOUT = 120000 // 2 minutes per file upload

export const client = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})
