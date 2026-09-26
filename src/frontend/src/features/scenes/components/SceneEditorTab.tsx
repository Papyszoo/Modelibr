import { Button } from 'primereact/button'
import { type JSX, useEffect, useRef, useState } from 'react'

import { useTabContext } from '@/hooks/useTabContext'
import { Dialog } from '@/shared/components/overlay/Dialog'
import { useSceneEditorStore } from '@/stores/sceneEditorStore'
import { useTabCloseGuardStore } from '@/stores/tabCloseGuardStore'

import { SceneEditor } from './SceneEditor'

/**
 * One scene, one tab.
 *
 * The tab owns the scene, so switching tabs never has to guess which draft is
 * live: mounting points the store at this scene, which restores that scene's own
 * session if it has one.
 *
 * The header's **Scenes** action focuses the list tab and leaves this one alone.
 * That is navigation, not a close - a user picking a different scene must not
 * lose the unsaved draft of the one they are in. Closing is the tab's own
 * affordance, and it asks first.
 */
export function SceneEditorTab({ sceneId }: { sceneId?: string }): JSX.Element {
  const { closeTab, tabId, openScenesList, relabelTab } = useTabContext()
  const openScene = useSceneEditorStore(state => state.openScene)
  const close = useSceneEditorStore(state => state.close)
  const discardDraft = useSceneEditorStore(state => state.discardDraft)
  const storeSceneId = useSceneEditorStore(state => state.sceneId)
  const registerCloseGuard = useTabCloseGuardStore(state => state.register)

  const numericId = sceneId ? Number(sceneId) : null

  // Restore this scene's session on the way in, so a tab switch is never the
  // thing that loses unsaved edits.
  useEffect(() => {
    if (numericId !== null) {
      openScene(numericId)
    }
  }, [openScene, numericId])

  /*
   * The editor owns the save mutation, and the close guard has to be able to run
   * it. A ref is the honest way to wire that: it is imperative, it is never
   * rendered, and it does not put the mutation - or a second copy of the save
   * logic - in the tab.
   */
  const saveRef = useRef<(() => Promise<boolean>) | null>(null)
  const [pendingClose, setPendingClose] = useState<
    ((decision: 'save-and-close' | 'discard' | 'cancel') => void) | null
  >(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (numericId === null) {
      return
    }
    const isDirty = useSceneEditorStore.getState

    return registerCloseGuard(tabId, async () => {
      // A clean scene closes without a question: there is nothing to lose, and
      // asking anyway trains people to click through the dialog.
      if (!isDirty().isDirty) {
        return 'discard'
      }

      const answer = await new Promise<'save-and-close' | 'discard' | 'cancel'>(
        resolve => {
          setPendingClose(() => resolve)
        }
      )

      if (answer === 'cancel') {
        return 'cancel'
      }

      if (answer === 'save-and-close') {
        setSaving(true)
        try {
          const saved = (await saveRef.current?.()) ?? false
          // A failed save keeps the tab, its draft and the dialog's error. Closing
          // because the user asked to close would throw away exactly the work
          // they asked to keep.
          return saved ? 'save-and-close' : 'cancel'
        } finally {
          setSaving(false)
        }
      }

      discardDraft(numericId)
      return 'discard'
    })
  }, [registerCloseGuard, tabId, numericId, discardDraft])

  if (numericId === null) {
    return (
      <div className="tab-error">This scene tab has no scene attached.</div>
    )
  }

  // Until the store points at this scene the editor would paint whichever draft
  // the previously active tab left behind. One loading frame beats one frame of
  // the wrong scene.
  if (storeSceneId !== null && storeSceneId !== numericId) {
    return <div className="tab-loading">Loading scene…</div>
  }

  return (
    <>
      <SceneEditor
        sceneId={numericId}
        onShowSceneList={openScenesList}
        registerSave={save => {
          saveRef.current = save
        }}
        onSceneNameChange={name => {
          // A rename relabels this tab; it never reopens it. Recreating the tab
          // would reset its internal state, and that state is how the app knows
          // which scene's draft this tab is showing.
          relabelTab(tabId, name)
        }}
        onClose={() => {
          // Explicit "I am done with this scene": forget its session and give up
          // the tab, which is what the user was on when they asked. The dirty case
          // never reaches here - the close guard above asks first.
          close()
          closeTab(tabId)
        }}
      />

      <Dialog
        open={pendingClose !== null}
        onClose={() => pendingClose?.('cancel')}
        size="sm"
        header="Unsaved scene changes"
        footer={
          <div className="scene-close-actions">
            <Button
              label="Cancel"
              text
              onClick={() => pendingClose?.('cancel')}
              disabled={saving}
            />
            <Button
              label="Discard"
              severity="danger"
              outlined
              onClick={() => pendingClose?.('discard')}
              disabled={saving}
            />
            <Button
              label={saving ? 'Saving...' : 'Save and close'}
              onClick={() => pendingClose?.('save-and-close')}
              loading={saving}
            />
          </div>
        }
      >
        <p className="scene-close-message">
          This scene has changes that have not been saved. Save them, discard
          them, or keep the tab open.
        </p>
      </Dialog>
    </>
  )
}
