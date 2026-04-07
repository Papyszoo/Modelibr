import './ModelList.css'
import 'primereact/resources/themes/lara-light-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'

import { type JSX } from 'react'

import { type TabContextValue } from '@/contexts/TabContext'
import { useTabContext } from '@/hooks/useTabContext'

import { ModelGrid } from './ModelGrid'

interface ModelListProps {
  onBackToUpload?: () => void
  isTabContent?: boolean
  tabId?: string
}

export function ModelList({
  onBackToUpload,
  isTabContent = false,
  tabId,
}: ModelListProps): JSX.Element {
  if (isTabContent) {
    return (
      <ModelListWithTabContext onBackToUpload={onBackToUpload} tabId={tabId} />
    )
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
  tabId,
}: {
  onBackToUpload?: () => void
  tabId?: string
}): JSX.Element {
  const tabContext = useTabContext()
  return (
    <ModelListContent
      onBackToUpload={onBackToUpload}
      tabContext={tabContext}
      isTabContent={true}
      tabId={tabId}
    />
  )
}

function ModelListContent({
  tabContext,
  tabId,
  isTabContent,
}: {
  onBackToUpload?: () => void
  tabContext: TabContextValue | null
  isTabContent: boolean
  tabId?: string
}): JSX.Element {
  const viewStateScope =
    isTabContent && tabContext && tabId
      ? `${tabContext.side}:${tabId}`
      : undefined

  return (
    <div className={`model-list ${isTabContent ? 'model-list-tab' : ''}`}>
      <ModelGrid viewStateScope={viewStateScope} />
    </div>
  )
}
