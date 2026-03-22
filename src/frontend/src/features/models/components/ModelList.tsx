import './ModelList.css'
import 'primereact/resources/themes/lara-light-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'

import { type JSX, useCallback, useState } from 'react'

import { type TabContextValue } from '@/contexts/TabContext'
import { useTabContext } from '@/hooks/useTabContext'

import { ModelGrid } from './ModelGrid'
import { ModelListHeader } from './ModelListHeader'

interface ModelListProps {
  onBackToUpload?: () => void
  isTabContent?: boolean
}

export function ModelList({
  onBackToUpload,
  isTabContent = false,
}: ModelListProps): JSX.Element {
  if (isTabContent) {
    return <ModelListWithTabContext onBackToUpload={onBackToUpload} />
  }

  return (
    <ModelListContent
      onBackToUpload={onBackToUpload}
      tabContext={null}
      isTabContent={false}
    />
  )
}

function ModelListWithTabContext({
  onBackToUpload,
}: {
  onBackToUpload?: () => void
}): JSX.Element {
  const tabContext = useTabContext()
  return (
    <ModelListContent
      onBackToUpload={onBackToUpload}
      tabContext={tabContext}
      isTabContent={true}
    />
  )
}

function ModelListContent({
  onBackToUpload,
  isTabContent,
}: {
  onBackToUpload?: () => void
  tabContext: TabContextValue | null
  isTabContent: boolean
}): JSX.Element {
  const [modelCount, setModelCount] = useState(0)
  const handleTotalCountChange = useCallback((count: number) => {
    setModelCount(count)
  }, [])

  return (
    <div className={`model-list ${isTabContent ? 'model-list-tab' : ''}`}>
      <ModelListHeader
        isTabContent={isTabContent}
        onBackToUpload={onBackToUpload}
        modelCount={modelCount}
      />

      <ModelGrid onTotalCountChange={handleTotalCountChange} />
    </div>
  )
}
