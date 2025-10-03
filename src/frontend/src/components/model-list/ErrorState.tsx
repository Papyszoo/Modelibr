import { Button } from 'primereact/button'

interface ErrorStateProps {
  visible: boolean
  error: string
  onRetry: () => void
}

export default function ErrorState({
  visible,
  error,
  onRetry,
}: ErrorStateProps) {
  if (!visible) return null

  return (
    <div className="error-message">
      <i className="pi pi-exclamation-triangle"></i>
      <span>{error}</span>
      <Button
        label="Retry"
        icon="pi pi-refresh"
        className="p-button-sm"
        onClick={onRetry}
      />
    </div>
  )
}
