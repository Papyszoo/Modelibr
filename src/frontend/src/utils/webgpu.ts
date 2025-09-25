// WebGPU detection utility

export interface WebGPUDetectionResult {
  supported: boolean
  reason?: string
  adapter?: GPUAdapter
  device?: GPUDevice
  features?: string[]
  limits?: GPUSupportedLimits
}

export const detectWebGPU = async (): Promise<WebGPUDetectionResult> => {
  if (!navigator.gpu) {
    return { supported: false, reason: 'WebGPU not available' }
  }

  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      return { supported: false, reason: 'No WebGPU adapter found' }
    }

    const device = await adapter.requestDevice()
    return {
      supported: true,
      adapter,
      device,
      features: Array.from(adapter.features),
      limits: adapter.limits,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    return { supported: false, reason: errorMessage }
  }
}

// Check if WebGPU is supported
export const isWebGPUSupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}
