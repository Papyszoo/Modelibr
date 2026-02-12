import { client } from '@/lib/apiBase'

export async function getBatchUploadHistory(): Promise<{
  uploads: Array<{
    id: number
    batchId: string
    uploadType: string
    uploadedAt: string
    fileId: number
    fileName: string
    packId: number | null
    packName: string | null
    projectId: number | null
    projectName: string | null
    modelId: number | null
    modelName: string | null
    textureSetId: number | null
    textureSetName: string | null
    spriteId: number | null
    spriteName: string | null
  }>
}> {
  const response = await client.get('/batch-uploads/history')
  return response.data
}
