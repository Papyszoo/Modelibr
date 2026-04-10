import { client, UPLOAD_TIMEOUT } from '@/lib/apiBase'
import {
  type AddEnvironmentMapVariantWithFileResponse,
  type CreateEnvironmentMapWithFileResponse,
  type EnvironmentMapDto,
  type GetAllEnvironmentMapsResponse,
  type GetAllEnvironmentMapsResponsePaginated,
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
  const formData = new FormData()
  formData.append('file', file)

  const params = new URLSearchParams()
  if (options.name) params.append('name', options.name)
  if (options.sizeLabel) params.append('sizeLabel', options.sizeLabel)
  if (options.batchId) params.append('batchId', options.batchId)
  if (options.packId !== undefined)
    params.append('packId', options.packId.toString())
  if (options.projectId !== undefined)
    params.append('projectId', options.projectId.toString())

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
  const formData = new FormData()
  formData.append('file', file)

  const params = new URLSearchParams()
  if (options.sizeLabel) params.append('sizeLabel', options.sizeLabel)

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
