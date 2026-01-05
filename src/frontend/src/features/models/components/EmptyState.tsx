interface EmptyStateProps {
  visible: boolean
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  customMessage?: string
}

export default function EmptyState({
  visible,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  customMessage,
}: EmptyStateProps) {
  if (!visible) return null

  return (
    <div
      className="empty-state"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <i className="pi pi-box" style={{ fontSize: '4rem' }}></i>
      <h3>{customMessage || 'No models found'}</h3>
      <p>Drag and drop 3D model files here to get started!</p>
    </div>
  )
}
