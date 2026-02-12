import { JSX } from 'react'
import './ModelList.css'
import { useTabContext } from '@/hooks/useTabContext'
import { TabContextValue } from '@/contexts/TabContext'
import ModelListHeader from './ModelListHeader'
import { ModelGrid } from './ModelGrid'
import 'primereact/resources/themes/lara-light-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'

interface ModelListProps {
  onBackToUpload?: () => void
  isTabContent?: boolean
}

function ModelList({
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
  return (
    <div className={`model-list ${isTabContent ? 'model-list-tab' : ''}`}>
      <ModelListHeader
        isTabContent={isTabContent}
        onBackToUpload={onBackToUpload}
        modelCount={0}
      />

      <ModelGrid />
    </div>
  )
}

export default ModelList
