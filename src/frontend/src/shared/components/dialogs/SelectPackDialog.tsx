import './SelectContainerDialog.css'

import { Dialog } from 'primereact/dialog'

import { usePacksQuery } from '@/features/pack/api/queries'

interface SelectPackDialogProps {
  visible: boolean
  onHide: () => void
  onSelect: (packId: number) => void
  header?: string
}

export function SelectPackDialog({
  visible,
  onHide,
  onSelect,
  header = 'Add to Pack',
}: SelectPackDialogProps) {
  const { data: packs = [], isLoading } = usePacksQuery({
    queryConfig: { enabled: visible },
  })

  return (
    <Dialog
      header={header}
      visible={visible}
      style={{ width: '500px' }}
      onHide={onHide}
    >
      <div className="container-selection-dialog">
        <p>Select a pack:</p>
        {isLoading ? (
          <p>Loading packs...</p>
        ) : packs.length === 0 ? (
          <div className="container-select-empty">
            <i className="pi pi-inbox" />
            <p>No packs available. Create a pack first.</p>
          </div>
        ) : (
          <div className="container-select-list">
            {packs.map(pack => (
              <div
                key={pack.id}
                className="container-select-item"
                onClick={() => onSelect(pack.id)}
              >
                <i className="pi pi-box" />
                <div className="container-select-item-content">
                  <span className="container-select-item-name">
                    {pack.name}
                  </span>
                  {pack.description && (
                    <span className="container-select-item-description">
                      {pack.description}
                    </span>
                  )}
                </div>
                <i className="pi pi-chevron-right" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}
