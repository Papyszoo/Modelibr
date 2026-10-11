import { useMutation } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'

import { requestModelBlenderOperation } from '@/features/models/api/modelApi'
import { type ModelUnbakedRigDto } from '@/features/models/types'
import { useBlenderEnabledStore } from '@/stores/blenderEnabledStore'

/**
 * What the counts in `unbakedRig` add up to, in the words a user can act on.
 *
 * Deliberately short: this sits above the Animation panel, not in it, so it has
 * to read in one line. Only non-zero features are named; a source with none of
 * a kind does not mention it.
 */
function describeRigFeatures(rig: ModelUnbakedRigDto): string {
  const parts: string[] = []

  const hasConstraints =
    rig.ikConstraints > 0 ||
    rig.boneConstraints > 0 ||
    rig.objectConstraints > 0
  if (hasConstraints) {
    parts.push(rig.ikConstraints > 0 ? 'IK and constraints' : 'constraints')
  }

  if (rig.objectDrivers > 0 || rig.armatureDrivers > 0) {
    parts.push('drivers')
  }
  if (rig.shapeKeyDrivers > 0) {
    parts.push('shape-key drivers')
  }
  if (rig.shapeKeyActions > 0) {
    parts.push('shape-key animation')
  }

  // `droppedModifiers` is `object:modifier (TYPE)` per modifier; the user reads
  // the modifier name, and several objects can share one type, so it is
  // deduplicated down to the names.
  const modifierNames = [
    ...new Set(
      rig.droppedModifiers
        .map(label => /:\s*([^()]+?)\s*\(/.exec(label)?.[1] ?? label)
        .filter(Boolean)
    ),
  ]
  if (modifierNames.length > 0) {
    parts.push(`${modifierNames.join(', ')} modifier`)
  }

  return parts.join(', ')
}

interface UnbakedRigWarningProps {
  modelId: number
  unbakedRig?: ModelUnbakedRigDto | null
}

/**
 * Warns that a .blend source carries rig features the web viewer cannot play as
 * authored (IK and other constraints, drivers, shape-key animation, modifiers
 * glTF would drop), and offers to bake them into keyframes.
 *
 * Rendered above the Animation panel; hidden entirely for every source whose
 * technical metadata carries no unbaked rig.
 */
export function UnbakedRigWarning({
  modelId,
  unbakedRig,
}: UnbakedRigWarningProps) {
  const toast = useRef<Toast>(null)
  const blenderEnabled = useBlenderEnabledStore(s => s.blenderEnabled)

  const bakeMutation = useMutation({
    mutationFn: () =>
      requestModelBlenderOperation(modelId, 'convert-format', {
        parametersJson: JSON.stringify({ format: 'glb', bake: true }),
      }),
    onSuccess: () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Bake queued',
        detail:
          'A baked version will appear in Versions when the job finishes.',
        life: 5000,
      })
    },
    onError: (error: unknown) => {
      toast.current?.show({
        severity: 'error',
        summary: 'Bake failed',
        detail:
          error instanceof Error
            ? error.message
            : 'The bake could not be queued.',
        life: 5000,
      })
    },
  })

  if (!unbakedRig?.hasRigFeatures) {
    return null
  }

  return (
    <div className="model-info-section" data-testid="unbaked-rig-warning">
      <Toast ref={toast} />
      <Message
        severity="warn"
        content={
          <div className="model-info-header-row">
            <span>
              This source has rig features the web viewer cannot play as
              authored: {describeRigFeatures(unbakedRig)}.
            </span>
            <Button
              label="Bake for web"
              icon="pi pi-bolt"
              size="small"
              className="p-button-outlined"
              disabled={!blenderEnabled}
              tooltip={
                blenderEnabled
                  ? undefined
                  : 'Install Blender in Settings to bake'
              }
              tooltipOptions={{ position: 'top' }}
              loading={bakeMutation.isPending}
              onClick={() => bakeMutation.mutate()}
            />
          </div>
        }
      />
    </div>
  )
}
