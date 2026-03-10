import { createContext, type ReactNode, useCallback, useState } from 'react'
import type * as THREE from 'three'

export interface ModelContextType {
  modelObject: THREE.Object3D | null
  setModelObject: (obj: THREE.Object3D | null) => void
  hoveredNodeId: string | null
  setHoveredNodeId: (id: string | null) => void
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export const ModelContext = createContext<ModelContextType | undefined>(
  undefined
)

export function ModelProvider({ children }: { children: ReactNode }) {
  const [modelObject, setModelObject] = useState<THREE.Object3D | null>(null)
  const [hoveredNodeId, setHoveredNodeIdRaw] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeIdRaw] = useState<string | null>(null)

  const setHoveredNodeId = useCallback((id: string | null) => {
    setHoveredNodeIdRaw(id)
  }, [])

  const setSelectedNodeId = useCallback((id: string | null) => {
    setSelectedNodeIdRaw(id)
  }, [])

  return (
    <ModelContext.Provider
      value={{
        modelObject,
        setModelObject,
        hoveredNodeId,
        setHoveredNodeId,
        selectedNodeId,
        setSelectedNodeId,
      }}
    >
      {children}
    </ModelContext.Provider>
  )
}
