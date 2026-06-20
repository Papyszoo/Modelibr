import { useScriptPreviewStore } from '@/stores/scriptPreviewStore'

/**
 * Toggles whether the preview pane sits to the right of, or below, the editor.
 * Lives in each preview's header (replaced the menubar "Layout" menu).
 */
export function PreviewLayoutToggle() {
  const panelPosition = useScriptPreviewStore(s => s.panelPosition)
  const setPanelPosition = useScriptPreviewStore(s => s.setPanelPosition)
  const next = panelPosition === 'right' ? 'bottom' : 'right'

  return (
    <button
      type="button"
      className="script-preview-toggle"
      onClick={() => setPanelPosition(next)}
      title={
        next === 'right' ? 'Move preview to the right' : 'Move preview below'
      }
      data-testid="script-preview-layout-toggle"
    >
      <i
        className={`pi ${panelPosition === 'right' ? 'pi-arrow-down' : 'pi-arrow-right'}`}
      />
    </button>
  )
}
