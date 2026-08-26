import './ImportSuggestionsDialog.css'

import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { type JSX, useState } from 'react'

import { resolveApiAssetUrl } from '@/lib/apiBase'
import { EmptyState, ErrorState, LoadingState } from '@/shared/components'
import { Dialog } from '@/shared/components'

import {
  useImportSuggestionsQuery,
  useReviewImportSuggestionsMutation,
} from '../api/queries'
import type { ImportSuggestionItem } from '../types'

interface ImportSuggestionsDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * What the import guessed, and the two answers to it.
 *
 * Reviewing is a bulk action by construction: the automation classifies a whole
 * import at once, so confirming 700 assets one card at a time is not a review -
 * it is the work the automation was supposed to remove. Selection is here so a
 * reviewer can disagree with part of a batch, not so they have to agree with each
 * asset individually.
 */
export function ImportSuggestionsDialog({
  open,
  onClose,
}: ImportSuggestionsDialogProps): JSX.Element {
  const [selected, setSelected] = useState<number[]>([])
  const { data, isLoading, isError, refetch } = useImportSuggestionsQuery({
    queryConfig: { enabled: open },
  })
  const review = useReviewImportSuggestionsMutation()

  const items = data?.items ?? []
  const hasSelection = selected.length > 0

  function toggle(modelId: number): void {
    setSelected(current =>
      current.includes(modelId)
        ? current.filter(id => id !== modelId)
        : [...current, modelId]
    )
  }

  function settle(accept: boolean): void {
    review.mutate(
      { accept, modelIds: hasSelection ? selected : undefined },
      { onSuccess: () => setSelected([]) }
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="large"
      header="Review automatic categories"
    >
      <div className="import-suggestions-dialog">
        {isLoading && <LoadingState variant="block" />}
        {isError && (
          <ErrorState
            variant="block"
            message="The review queue could not be loaded."
            onRetry={() => void refetch()}
          />
        )}

        {!isLoading && !isError && items.length === 0 && (
          <EmptyState
            variant="compact"
            icon="pi pi-check-circle"
            title="Nothing left to review"
            message="Every automatic category and tag has been settled."
          />
        )}

        {items.length > 0 && (
          <>
            <p className="import-suggestions-dialog-lead">
              These were worked out from each asset&apos;s name, the folder it
              was imported from, and what its neighbours are called. Nothing
              here replaced a category or tag you had already set.
            </p>

            <ul className="import-suggestions-dialog-list">
              {items.map(item => (
                <SuggestionRow
                  key={item.modelId}
                  item={item}
                  checked={selected.includes(item.modelId)}
                  onToggle={() => toggle(item.modelId)}
                />
              ))}
            </ul>

            {data && data.total > items.length && (
              <p className="import-suggestions-dialog-more">
                Showing {items.length} of {data.total}. Settling everything
                works through the rest in batches.
              </p>
            )}

            <div className="import-suggestions-dialog-actions">
              <Button
                label={hasSelection ? 'Undo selected' : 'Undo all'}
                size="small"
                outlined
                severity="danger"
                loading={review.isPending}
                onClick={() => settle(false)}
              />
              <Button
                label={hasSelection ? 'Keep selected' : 'Keep all'}
                size="small"
                loading={review.isPending}
                onClick={() => settle(true)}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

function SuggestionRow({
  item,
  checked,
  onToggle,
}: {
  item: ImportSuggestionItem
  checked: boolean
  onToggle: () => void
}): JSX.Element {
  const thumbnailUrl = resolveApiAssetUrl(item.thumbnailUrl)

  return (
    <li className="import-suggestion-row">
      <Checkbox
        inputId={`import-suggestion-${item.modelId}`}
        checked={checked}
        onChange={onToggle}
      />
      <div className="import-suggestion-thumb">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <i className="pi pi-box" aria-hidden="true" />
        )}
      </div>
      <div className="import-suggestion-detail">
        <label
          className="import-suggestion-name"
          htmlFor={`import-suggestion-${item.modelId}`}
        >
          {item.name}
        </label>
        <div className="import-suggestion-values">
          {item.categoryName && (
            <span className="import-suggestion-chip import-suggestion-chip-category">
              {item.categoryName}
            </span>
          )}
          {item.tags.map(tag => (
            <span key={tag} className="import-suggestion-chip">
              {tag}
            </span>
          ))}
        </div>
        {/* The evidence, not decoration: the tags came from this path, and a
            reviewer deciding whether "Characters" belongs needs to see it. */}
        {item.sourceFolder && (
          <span className="import-suggestion-source" title={item.sourceFolder}>
            {item.sourceFolder}
          </span>
        )}
      </div>
    </li>
  )
}
