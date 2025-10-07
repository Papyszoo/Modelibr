import { useContext } from 'react'
import { ModelContext } from '../contexts/ModelContext'

export function useModelObject() {
  const context = useContext(ModelContext)
  if (context === undefined) {
    throw new Error('useModelObject must be used within a ModelProvider')
  }
  return context
}
