import './PackList.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { Toast } from 'primereact/toast'
import { useState } from 'react'
import { useRef } from 'react'

import { deletePack } from '@/features/pack/api/packApi'
import { usePacksQuery } from '@/features/pack/api/queries'
import { useTabContext } from '@/hooks/useTabContext'
import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { type PackDto } from '@/types'

import { CreatePackDialog } from './CreatePackDialog'

export function PackList() {
  const queryClient = useQueryClient()
  const packsQuery = usePacksQuery()
  const packs = packsQuery.data ?? []
  const loading = packsQuery.isLoading
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLicense, setSelectedLicense] = useState<string | null>(null)
  const toast = useRef<Toast>(null)
  const { openPackDetailsTab } = useTabContext()

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.packs

  const invalidatePacks = async () => {
    await queryClient.invalidateQueries({ queryKey: ['packs'] })
  }

  const deletePackMutation = useMutation({
    mutationFn: (packId: number) => deletePack(packId),
    onMutate: async packId => {
      await queryClient.cancelQueries({ queryKey: ['packs'] })
      const previousPacks = queryClient.getQueryData<PackDto[]>(['packs'])
      queryClient.setQueryData<PackDto[]>(['packs'], current =>
        (current ?? []).filter(p => p.id !== packId)
      )
      return { previousPacks }
    },
    onError: (error, _packId, context) => {
      console.error('Failed to delete pack:', error)
      if (context?.previousPacks) {
        queryClient.setQueryData(['packs'], context.previousPacks)
      }
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete pack',
        life: 3000,
      })
    },
    onSuccess: () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Pack deleted successfully',
        life: 3000,
      })
    },
    onSettled: async () => {
      await invalidatePacks()
    },
  })

  const handleDeletePack = async (packId: number) => {
    await deletePackMutation.mutateAsync(packId)
  }

  const licenseOptions = Array.from(
    new Set(packs.map(pack => pack.licenseType).filter(Boolean))
  ).map(license => ({ label: license, value: license }))

  const filteredPacks = packs.filter(pack => {
    const matchesSearch =
      searchQuery.trim().length === 0 ||
      pack.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pack.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())

    const matchesLicense =
      !selectedLicense || pack.licenseType === selectedLicense
    return matchesSearch && matchesLicense
  })

  return (
    <div className="pack-list">
      <Toast ref={toast} />

      <div className="pack-list-header">
        <h2>Packs</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div className="search-bar" style={{ minWidth: '220px' }}>
            <i className="pi pi-search" />
            <InputText
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search packs"
            />
          </div>
          <Dropdown
            value={selectedLicense}
            options={licenseOptions}
            onChange={e => setSelectedLicense(e.value ?? null)}
            placeholder="License"
            showClear
            className="filter-multiselect"
          />
          <CardWidthSlider
            value={cardWidth}
            min={200}
            max={500}
            onChange={width => setCardWidth('packs', width)}
          />
          <Button
            label="Create Pack"
            icon="pi pi-plus"
            onClick={() => setShowCreateDialog(true)}
          />
        </div>
      </div>

      {loading ? (
        <div className="pack-list-loading">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }} />
          <p>Loading packs...</p>
        </div>
      ) : filteredPacks.length === 0 ? (
        <div className="pack-list-empty">
          <i className="pi pi-box" style={{ fontSize: '3rem' }} />
          <h3>No Matching Packs</h3>
          <p>Adjust the filters or create a new pack.</p>
          <Button
            label="Create Pack"
            icon="pi pi-plus"
            onClick={() => setShowCreateDialog(true)}
          />
        </div>
      ) : (
        <div
          className="pack-grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
          }}
        >
          {filteredPacks.map(pack => {
            const thumbnail = pack.customThumbnailUrl
            return (
              <div
                key={pack.id}
                className="pack-grid-card"
                data-pack-id={pack.id}
                onClick={() => {
                  openPackDetailsTab(pack.id.toString())
                }}
              >
                <div className="pack-grid-card-image">
                  {thumbnail ? (
                    <img src={thumbnail} alt={pack.name} />
                  ) : (
                    <div className="pack-grid-card-placeholder">
                      <i className="pi pi-box" />
                    </div>
                  )}
                </div>
                <div className="pack-grid-card-content">
                  <h3 className="pack-grid-card-title">{pack.name}</h3>
                  {pack.description && (
                    <p className="pack-grid-card-description">
                      {pack.description}
                    </p>
                  )}
                  {(pack.licenseType || pack.url) && (
                    <div className="pack-grid-card-stats">
                      {pack.licenseType && <span>{pack.licenseType}</span>}
                      {pack.url && <span>Link</span>}
                    </div>
                  )}
                  <div className="pack-grid-card-stats">
                    <span>
                      <i className="pi pi-box" /> {pack.modelCount}
                    </span>
                    <span>
                      <i className="pi pi-palette" /> {pack.textureSetCount}
                    </span>
                    <span>
                      <i className="pi pi-image" /> {pack.spriteCount}
                    </span>
                    <span>
                      <i className="pi pi-volume-up" /> {pack.soundCount}
                    </span>
                  </div>
                </div>
                <div className="pack-grid-card-actions">
                  <Button
                    icon="pi pi-trash"
                    className="p-button-text p-button-rounded p-button-danger p-button-sm"
                    tooltip="Delete Pack"
                    disabled={deletePackMutation.isPending}
                    onClick={e => {
                      e.stopPropagation()
                      handleDeletePack(pack.id)
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreatePackDialog
        visible={showCreateDialog}
        onHide={() => setShowCreateDialog(false)}
      />
    </div>
  )
}
