import axios, {
  type AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
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

export function resolveApiAssetUrl(url?: string | null): string | null {
  if (!url) {
    return null
  }

  if (/^(https?:|blob:|data:)/i.test(url)) {
    return url
  }

  try {
    return new URL(url, baseURL).toString()
  } catch {
    // baseURL is relative (e.g. "/api") - prepend it to the path
    if (baseURL.startsWith('/') && url.startsWith('/')) {
      return `${baseURL}${url}`
    }
    return url
  }
}

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
  /** Original axios request config - lets callers retry the request. */
  requestConfig?: InternalAxiosRequestConfig
}

export class ApiClientError extends Error implements NormalizedApiError {
  status?: number
  code?: string
  details?: unknown
  requestId?: string
  isNetworkError: boolean
  isTimeout: boolean
  isOffline: boolean
  requestConfig?: InternalAxiosRequestConfig

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
    this.requestConfig = normalized.requestConfig
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
    requestConfig: error.config,
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

/**
 * Creates an axios instance with the app's shared conventions: JSON headers,
 * a default Accept header, and rejection with a normalized ApiClientError.
 * Feature modules that talk to a different origin (e.g. the Asset Store)
 * build their client through this factory instead of forking the setup.
 */
export function createApiClient(
  clientBaseURL: string,
  options: { timeout?: number } = {}
) {
  const instance = axios.create({
    baseURL: clientBaseURL,
    timeout: options.timeout ?? 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  instance.interceptors.request.use(attachDefaultRequestHeaders)

  instance.interceptors.response.use(
    response => response,
    error => {
      if (!axios.isAxiosError(error)) {
        return Promise.reject(error)
      }

      return Promise.reject(normalizeAxiosError(error))
    }
  )

  return instance
}

export const client = createApiClient(baseURL)
