import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios'

export const baseURL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

if (import.meta.env.DEV && !import.meta.env.VITE_API_BASE_URL) {
  console.warn(
    '[Modelibr] VITE_API_BASE_URL is not set. Falling back to http://localhost:8080. ' +
      'Set this variable in your .env file for proper configuration.'
  )
}

export const UPLOAD_TIMEOUT = 120000 // 2 minutes per file upload

type ApiErrorBody = {
  error?: string
  message?: string
  title?: string
  detail?: string
  errors?: Record<string, string[] | string>
}

export interface NormalizedApiError {
  status?: number
  code?: string
  details?: unknown
  requestId?: string
  isNetworkError: boolean
  isTimeout: boolean
  isOffline: boolean
}

export class ApiClientError extends Error implements NormalizedApiError {
  status?: number
  code?: string
  details?: unknown
  requestId?: string
  isNetworkError: boolean
  isTimeout: boolean
  isOffline: boolean

  constructor(message: string, normalized: NormalizedApiError) {
    super(message)
    this.name = 'ApiClientError'
    this.status = normalized.status
    this.code = normalized.code
    this.details = normalized.details
    this.requestId = normalized.requestId
    this.isNetworkError = normalized.isNetworkError
    this.isTimeout = normalized.isTimeout
    this.isOffline = normalized.isOffline
  }
}

const getErrorMessageFromBody = (body: unknown): string | undefined => {
  if (!body || typeof body !== 'object') return undefined

  const typedBody = body as ApiErrorBody

  if (typeof typedBody.message === 'string' && typedBody.message.trim()) {
    return typedBody.message
  }
  if (typeof typedBody.error === 'string' && typedBody.error.trim()) {
    return typedBody.error
  }
  if (typeof typedBody.detail === 'string' && typedBody.detail.trim()) {
    return typedBody.detail
  }
  if (typeof typedBody.title === 'string' && typedBody.title.trim()) {
    return typedBody.title
  }

  return undefined
}

const getErrorRequestId = (error: AxiosError): string | undefined => {
  const headers = error.response?.headers
  if (!headers) return undefined

  if (headers instanceof AxiosHeaders) {
    const requestId = headers.get('x-request-id')
    return typeof requestId === 'string' ? requestId : undefined
  }

  const recordHeaders = headers as Record<string, unknown>
  const requestId = recordHeaders['x-request-id']
  return typeof requestId === 'string' ? requestId : undefined
}

const normalizeAxiosError = (error: AxiosError): ApiClientError => {
  const isNetworkError = !error.response
  const isTimeout =
    error.code === 'ECONNABORTED' ||
    error.message.toLowerCase().includes('timeout')
  const isOffline =
    isNetworkError &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false

  const message =
    getErrorMessageFromBody(error.response?.data) ||
    (isOffline
      ? 'Unable to connect while offline'
      : isTimeout
        ? 'Request timed out'
        : error.response?.statusText ||
          error.message ||
          'An unexpected error occurred')

  return new ApiClientError(message, {
    status: error.response?.status,
    code: error.code,
    details: error.response?.data,
    requestId: getErrorRequestId(error),
    isNetworkError,
    isTimeout,
    isOffline,
  })
}

const attachDefaultRequestHeaders = (
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig => {
  const headers = AxiosHeaders.from(config.headers)

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  config.headers = headers
  return config
}

export const client = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

client.interceptors.request.use(attachDefaultRequestHeaders)

client.interceptors.response.use(
  response => response,
  error => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error)
    }

    return Promise.reject(normalizeAxiosError(error))
  }
)
