import { createContext, type ReactNode, useState } from 'react'
import type * as THREE from 'three'

export interface ModelContextType {
  modelObject: THREE.Object3D | null
  setModelObject: (obj: THREE.Object3D | null) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export const ModelContext = createContext<ModelContextType | undefined>(
  undefined
)

export function ModelProvider({ children }: { children: ReactNode }) {
  const [modelObject, setModelObject] = useState<THREE.Object3D | null>(null)

  return (
    <ModelContext.Provider value={{ modelObject, setModelObject }}>
      {children}
    </ModelContext.Provider>
  )
}
