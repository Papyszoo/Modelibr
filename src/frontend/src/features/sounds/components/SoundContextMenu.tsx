import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { type RefObject, useMemo } from 'react'

interface SoundContextMenuProps {
  contextMenuRef: RefObject<ContextMenu | null>
  selectedCount: number
  onShowInFolder: () => void
  onCopyPath: () => void
  onRecycle: () => void
}

export function SoundContextMenu({
  contextMenuRef,
  selectedCount,
  onShowInFolder,
  onCopyPath,
  onRecycle,
}: SoundContextMenuProps) {
  const items: MenuItem[] = useMemo(() => {
    const label =
      selectedCount > 1 ? `Recycle ${selectedCount} sounds` : 'Recycle'

    return [
      {
        label: 'Show in Folder',
        icon: 'pi pi-folder-open',
        command: onShowInFolder,
      },
      {
        label: 'Copy Folder Path',
        icon: 'pi pi-copy',
        command: onCopyPath,
      },
      {
        separator: true,
      },
      {
        label,
        icon: 'pi pi-trash',
        command: onRecycle,
      },
    ]
  }, [selectedCount, onShowInFolder, onCopyPath, onRecycle])

  return <ContextMenu ref={contextMenuRef} model={items} />
}
