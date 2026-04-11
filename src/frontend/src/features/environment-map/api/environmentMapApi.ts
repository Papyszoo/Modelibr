import { client, UPLOAD_TIMEOUT } from '@/lib/apiBase'
import {
  type AddEnvironmentMapVariantWithFileResponse,
  type CreateEnvironmentMapWithFileResponse,
  type EnvironmentMapCubeFace,
  type EnvironmentMapDto,
  type GetAllEnvironmentMapsResponse,
  type GetAllEnvironmentMapsResponsePaginated,
  type UpdateEnvironmentMapMetadataResponse,
} from '@/types'

function buildEnvironmentMapQueryString(options: {
  page?: number
  pageSize?: number
  packId?: number
  projectId?: number
}) {
  const params = new URLSearchParams()

  if (options.page !== undefined) params.append('page', options.page.toString())
  if (options.pageSize !== undefined)
    params.append('pageSize', options.pageSize.toString())
  if (options.packId !== undefined)
    params.append('packId', options.packId.toString())
  if (options.projectId !== undefined)
    params.append('projectId', options.projectId.toString())

  return params.toString()
}

export async function getAllEnvironmentMaps(
  options: {
    packId?: number
    projectId?: number
  } = {}
): Promise<EnvironmentMapDto[]> {
  const query = buildEnvironmentMapQueryString(options)
  const url = query ? `/environment-maps?${query}` : '/environment-maps'
  const response = await client.get<GetAllEnvironmentMapsResponse>(url)
  return response.data.environmentMaps
}

export async function getEnvironmentMapsPaginated(options: {
  page: number
  pageSize: number
  packId?: number
  projectId?: number
}): Promise<GetAllEnvironmentMapsResponsePaginated> {
  const query = buildEnvironmentMapQueryString(options)
  const response = await client.get<GetAllEnvironmentMapsResponsePaginated>(
    `/environment-maps?${query}`
  )
  return response.data
}

export async function getEnvironmentMapById(
  id: number
): Promise<EnvironmentMapDto> {
  const response = await client.get<EnvironmentMapDto>(
    `/environment-maps/${id}`
  )
  return response.data
}

export async function createEnvironmentMapWithFile(
  file: File,
  options: {
    name?: string
    sizeLabel?: string
    batchId?: string
    packId?: number
    projectId?: number
  } = {}
): Promise<CreateEnvironmentMapWithFileResponse> {
  return createEnvironmentMapUpload({
    file,
    options,
  })
}

export async function createEnvironmentMapUpload({
  file,
  cubeFaces,
  options = {},
}: {
  file?: File
  cubeFaces?: Partial<Record<EnvironmentMapCubeFace, File>>
  options?: {
    name?: string
    sizeLabel?: string
    batchId?: string
    packId?: number
    projectId?: number
    sourceType?: string
    projectionType?: string
  }
}): Promise<CreateEnvironmentMapWithFileResponse> {
  if (!file && !cubeFaces) {
    throw new Error('No environment map files provided')
  }

  const formData = new FormData()
  if (file) {
    formData.append('file', file)
  }

  if (cubeFaces) {
    ;(['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const).forEach(face => {
      const cubeFaceFile = cubeFaces[face]
      if (cubeFaceFile) {
        formData.append(face, cubeFaceFile)
      }
    })
  }

  const params = new URLSearchParams()
  if (options.name) params.append('name', options.name)
  if (options.sizeLabel) params.append('sizeLabel', options.sizeLabel)
  if (options.batchId) params.append('batchId', options.batchId)
  if (options.packId !== undefined)
    params.append('packId', options.packId.toString())
  if (options.projectId !== undefined)
    params.append('projectId', options.projectId.toString())
  if (options.sourceType) params.append('sourceType', options.sourceType)
  if (options.projectionType)
    params.append('projectionType', options.projectionType)

  const query = params.toString()
  const response = await client.post<CreateEnvironmentMapWithFileResponse>(
    query
      ? `/environment-maps/with-file?${query}`
      : '/environment-maps/with-file',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: UPLOAD_TIMEOUT,
    }
  )

  return response.data
}

export async function addEnvironmentMapVariantWithFile(
  environmentMapId: number,
  file: File,
  options: {
    sizeLabel?: string
  } = {}
): Promise<AddEnvironmentMapVariantWithFileResponse> {
  return addEnvironmentMapVariantUpload(environmentMapId, {
    file,
    options,
  })
}

export async function addEnvironmentMapVariantUpload(
  environmentMapId: number,
  {
    file,
    cubeFaces,
    options = {},
  }: {
    file?: File
    cubeFaces?: Partial<Record<EnvironmentMapCubeFace, File>>
    options?: {
      sizeLabel?: string
      sourceType?: string
      projectionType?: string
    }
  }
): Promise<AddEnvironmentMapVariantWithFileResponse> {
  if (!file && !cubeFaces) {
    throw new Error('No environment map files provided')
  }

  const formData = new FormData()
  if (file) {
    formData.append('file', file)
  }

  if (cubeFaces) {
    ;(['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const).forEach(face => {
      const cubeFaceFile = cubeFaces[face]
      if (cubeFaceFile) {
        formData.append(face, cubeFaceFile)
      }
    })
  }

  const params = new URLSearchParams()
  if (options.sizeLabel) params.append('sizeLabel', options.sizeLabel)
  if (options.sourceType) params.append('sourceType', options.sourceType)
  if (options.projectionType)
    params.append('projectionType', options.projectionType)

  const query = params.toString()
  const response = await client.post<AddEnvironmentMapVariantWithFileResponse>(
    query
      ? `/environment-maps/${environmentMapId}/variants/with-file?${query}`
      : `/environment-maps/${environmentMapId}/variants/with-file`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: UPLOAD_TIMEOUT,
    }
  )

  return response.data
}

export async function softDeleteEnvironmentMap(
  environmentMapId: number
): Promise<void> {
  await client.delete(`/environment-maps/${environmentMapId}/soft`)
}

export async function setEnvironmentMapCustomThumbnail(
  environmentMapId: number,
  fileId: number | null
): Promise<void> {
  await client.put(`/environment-maps/${environmentMapId}/thumbnail`, {
    fileId,
  })
}

export async function regenerateEnvironmentMapThumbnail(
  environmentMapId: number,
  variantId?: number
): Promise<void> {
  const query = variantId ? `?variantId=${variantId}` : ''
  await client.post(
    `/environment-maps/${environmentMapId}/thumbnail/regenerate${query}`
  )
}

export async function updateEnvironmentMap(
  environmentMapId: number,
  payload: {
    name?: string
    previewVariantId?: number | null
  }
): Promise<{ id: number; name: string; previewVariantId?: number | null }> {
  const response = await client.put<{
    id: number
    name: string
    previewVariantId?: number | null
  }>(`/environment-maps/${environmentMapId}`, payload)

  return response.data
}

export async function updateEnvironmentMapMetadata(
  environmentMapId: number,
  payload: {
    tags?: string[]
    categoryId?: number | null
  }
): Promise<UpdateEnvironmentMapMetadataResponse> {
  const response = await client.post<UpdateEnvironmentMapMetadataResponse>(
    `/environment-maps/${environmentMapId}/metadata`,
    payload
  )

  return response.data
}
