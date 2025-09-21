// WebGPU detection utility
export const detectWebGPU = async () => {
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
      limits: adapter.limits 
    }
  } catch (error) {
    return { supported: false, reason: error.message }
  }
}

// Check if WebGPU is supported
export const isWebGPUSupported = () => {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}