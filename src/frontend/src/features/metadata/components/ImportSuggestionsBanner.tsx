import './ImportSuggestionsBanner.css'

import { Button } from 'primereact/button'
import { type JSX, useState } from 'react'

import {
  useImportSuggestionsQuery,
  useReviewImportSuggestionsMutation,
} from '../api/queries'
import { ImportSuggestionsDialog } from './ImportSuggestionsDialog'

/**
 * "N assets categorized automatically - review."
 *
 * The other half of automating classification. An import that quietly assigned
 * categories and tags would be the worst of both worlds: the library gains
 * decisions nobody made and nothing says which ones were guessed. This is where
 * they wait until a person keeps or discards them.
 *
 * Renders nothing at all when the queue is empty, which is the normal state - a
 * persistent zero-count strip would be chrome the user pays for every day for the
 * few days a year they import a library.
 */
export function ImportSuggestionsBanner(): JSX.Element | null {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { data } = useImportSuggestionsQuery()
  const review = useReviewImportSuggestionsMutation()

  const total = data?.total ?? 0
  if (total === 0) {
    return null
  }

  return (
    <>
      <div className="import-suggestions-banner" role="status">
        <i
          className="pi pi-sparkles import-suggestions-banner-icon"
          aria-hidden="true"
        />
        <span className="import-suggestions-banner-text">
          {total === 1
            ? '1 asset was categorized automatically'
            : `${total} assets were categorized automatically`}
        </span>
        <div className="import-suggestions-banner-actions">
          <Button
            label="Review"
            size="small"
            text
            onClick={() => setIsDialogOpen(true)}
          />
          <Button
            label="Keep all"
            size="small"
            outlined
            loading={review.isPending}
            onClick={() => review.mutate({ accept: true })}
          />
        </div>
      </div>

      <ImportSuggestionsDialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  )
}
