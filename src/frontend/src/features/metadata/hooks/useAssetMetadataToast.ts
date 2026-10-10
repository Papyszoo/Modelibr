import { type Toast } from 'primereact/toast'
import { type RefObject, useCallback } from 'react'

export interface AssetMetadataToastOptions {
  severity: string
  summary: string
  detail: string
  life: number
}

/**
 * Adapts an `AssetMetadataPanel` toast callback to a component's local
 * PrimeReact `Toast` ref.
 *
 * The panel reports only success/error; anything that is not an error is shown
 * as success. Shared so every viewer that hosts the panel reports metadata
 * saves the same way.
 */
export function useAssetMetadataToast(
  toast: RefObject<Toast | null>
): (options: AssetMetadataToastOptions) => void {
  return useCallback(
    ({ severity, summary, detail, life }: AssetMetadataToastOptions) => {
      toast.current?.show({
        severity: severity === 'error' ? 'error' : 'success',
        summary,
        detail,
        life,
      })
    },
    [toast]
  )
}
