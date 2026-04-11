export function getFileExtension(source?: string | null): string {
  if (!source) {
    return ''
  }

  const withoutQuery = source.split('?')[0]
  const extension = withoutQuery.split('.').pop()?.toLowerCase()
  return extension || ''
}

export function getExtensionFromContentType(
  contentType: string | null
): string {
  switch (contentType?.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/vnd.radiance':
      return 'hdr'
    case 'image/x-exr':
    case 'application/octet-stream':
      return 'exr'
    default:
      return ''
  }
}

export function sanitizeFileStem(value: string): string {
  return value
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildDownloadName(
  baseName: string,
  variantLabel: string,
  extension: string
): string {
  const suffix = sanitizeFileStem(variantLabel || 'environment')
  const stem = `${sanitizeFileStem(baseName)}-${suffix}`
  return extension ? `${stem}.${extension}` : stem
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

export async function downloadFromUrl(
  url: string,
  fileName: string,
  explicitExtension?: string
): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}.`)
  }

  const blob = await response.blob()
  const extension =
    explicitExtension ||
    getFileExtension(fileName) ||
    getExtensionFromContentType(response.headers.get('content-type')) ||
    'bin'
  const normalizedFileName = fileName.includes('.')
    ? fileName
    : `${fileName}.${extension}`

  triggerDownload(blob, normalizedFileName)
}
