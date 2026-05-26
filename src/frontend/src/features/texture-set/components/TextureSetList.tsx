import './TextureSetList.css'

import { useQueryClient } from '@tanstack/react-query'
import { Toast } from 'primereact/toast'
import { type JSX, useRef, useState } from 'react'

import { type TabContextValue } from '@/contexts/TabContext'
import { updateTextureSetKind } from '@/features/texture-set/api/textureSetApi'
import { useTabContext } from '@/hooks/useTabContext'
import { TextureSetKind } from '@/types'

import { TextureSetGrid } from './TextureSetGrid'

interface TextureSetListProps {
  /**
   * Optional kind lock. Dedicated Global Materials / Multi-Model Textures
   * tabs pass their kind; the generic textureSets tab leaves it undefined
   * and exposes the kind-filter switcher below.
   */
  kind?: TextureSetKind
  /** True when rendered inside the tab dock — enables per-tab view state. */
  isTabContent?: boolean
  tabId?: string
}

export function TextureSetList({
  kind,
  isTabContent = false,
  tabId,
}: TextureSetListProps = {}): JSX.Element {
  if (isTabContent) {
    return <TextureSetListWithTabContext kind={kind} tabId={tabId} />
  }

  return (
    <TextureSetListContent kind={kind} tabContext={null} isTabContent={false} />
  )
}

function TextureSetListWithTabContext({
  kind,
  tabId,
}: {
  kind?: TextureSetKind
  tabId?: string
}): JSX.Element {
  const tabContext = useTabContext()
  return (
    <TextureSetListContent
      kind={kind}
      tabContext={tabContext}
      isTabContent={true}
      tabId={tabId}
    />
  )
}

type KindFilter = 'universal' | 'model-specific'

const KIND_FILTER_OPTIONS: {
  label: string
  value: KindFilter
  kind: TextureSetKind
}[] = [
  {
    label: 'Multi-Model',
    value: 'model-specific',
    kind: TextureSetKind.ModelSpecific,
  },
  {
    label: 'Global Materials',
    value: 'universal',
    kind: TextureSetKind.Universal,
  },
]

function kindToFilter(kind: TextureSetKind): KindFilter {
  return kind === TextureSetKind.Universal ? 'universal' : 'model-specific'
}

function TextureSetListContent({
  kind,
  tabContext,
  tabId,
  isTabContent,
}: {
  kind?: TextureSetKind
  tabContext: TabContextValue | null
  isTabContent: boolean
  tabId?: string
}): JSX.Element {
  const isKindLocked = kind !== undefined

  // On the generic textureSets tab the user picks the kind via the switcher
  // below; the dedicated Global Materials / Multi-Model Textures tabs lock
  // it via the `kind` prop and hide the switcher.
  const [kindFilter, setKindFilter] = useState<KindFilter>(
    kind !== undefined ? kindToFilter(kind) : 'universal'
  )

  const effectiveKind: TextureSetKind = isKindLocked
    ? (kind as TextureSetKind)
    : KIND_FILTER_OPTIONS.find(opt => opt.value === kindFilter)!.kind

  const [dragOverTab, setDragOverTab] = useState<KindFilter | null>(null)
  const toast = useRef<Toast>(null)
  const queryClient = useQueryClient()

  const scopeKindKey = kind ?? `generic:${kindFilter}`
  const viewStateScope =
    isTabContent && tabContext && tabId
      ? `${tabContext.side}:${tabId}:${scopeKindKey}`
      : undefined

  return (
    <div
      className={`texture-set-list${isTabContent ? ' texture-set-list-tab' : ''}`}
    >
      <Toast ref={toast} />

      {!isKindLocked && (
        <div className="kind-filter-bar">
          <div className="kind-filter-select p-selectbutton p-component">
            {KIND_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={
                  'p-button p-component' +
                  (kindFilter === opt.value ? ' p-highlight' : '') +
                  (dragOverTab === opt.value && kindFilter !== opt.value
                    ? ' p-button-outlined kind-drop-target'
                    : '')
                }
                onClick={() => {
                  if (kindFilter === opt.value) return
                  setKindFilter(opt.value)
                }}
                onDragOver={e => {
                  if (
                    e.dataTransfer.types.includes(
                      'application/x-texture-set-id'
                    )
                  ) {
                    e.preventDefault()
                    e.stopPropagation()
                    setDragOverTab(opt.value)
                  }
                }}
                onDragLeave={() => setDragOverTab(null)}
                onDrop={async e => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDragOverTab(null)
                  const textureSetId = e.dataTransfer.getData(
                    'application/x-texture-set-id'
                  )
                  if (!textureSetId) return
                  if (opt.value === kindFilter) return
                  try {
                    await updateTextureSetKind(Number(textureSetId), opt.kind)
                    toast.current?.show({
                      severity: 'success',
                      summary: 'Kind Changed',
                      detail: `Texture set moved to ${opt.label}`,
                      life: 3000,
                    })
                    await queryClient.invalidateQueries({
                      queryKey: ['textureSets'],
                    })
                  } catch (error) {
                    console.error('Failed to change texture set kind:', error)
                    toast.current?.show({
                      severity: 'error',
                      summary: 'Error',
                      detail: 'Failed to change texture set kind',
                      life: 3000,
                    })
                  }
                }}
              >
                <span className="p-button-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <TextureSetGrid kind={effectiveKind} viewStateScope={viewStateScope} />
    </div>
  )
}
