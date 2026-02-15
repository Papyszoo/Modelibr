interface ChangesSummaryProps {
  hasChanges: boolean
}

export function ChangesSummary({ hasChanges }: ChangesSummaryProps) {
  if (!hasChanges) return null

  return (
    <div className="changes-summary">
      <div className="p-message p-message-info">
        <div className="p-message-wrapper">
          <div className="p-message-icon">
            <i className="pi pi-info-circle"></i>
          </div>
          <div className="p-message-text">
            You have unsaved changes. Click "Save Changes" to apply them.
          </div>
        </div>
      </div>
    </div>
  )
}
