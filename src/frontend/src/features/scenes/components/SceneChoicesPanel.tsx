import './SceneChoicesPanel.css'

import { Button } from 'primereact/button'
import { type JSX, useState } from 'react'

import { MaterialSwatch } from '@/features/materials/components/MaterialSwatch'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import { Dialog, EmptyState } from '@/shared/components'

import type {
  SceneCandidateFacts,
  SceneCandidateMedia,
  SceneRecommendationChoice,
  SceneSlotCandidateView,
  SceneSlotView,
} from '../types'

/**
 * The decisions in a scene the user has not made yet, and the options for each.
 *
 * This is the half of agent authoring that keeps it reviewable. An agent that
 * silently picks assets produces a scene whose choices cannot be argued with;
 * the same agent proposing `streetlight/A`, `B` and `C` produces one the user
 * can say "B is too modern, and none of the road options work" about, out loud,
 * and be understood exactly.
 *
 * Three rules the layout is built around:
 *
 * - **Every card shows its id verbatim.** The id is the handle the user speaks
 *   and the agent resolves; hiding it behind a position ("the second one")
 *   breaks the moment a candidate is added or rejected.
 * - **Rejected cards stay.** Greyed, with the reason, because a rejection is
 *   feedback rather than a deletion - the user sees what was ruled out, and so
 *   does the agent reading the slot back.
 * - **The numbers sit beside the rationale.** A rationale alone is a plausible
 *   sentence about an asset nobody measured, and it is exactly what a user
 *   cannot overrule.
 */
interface SceneChoicesPanelProps {
  slots: SceneSlotView[]
  isLoading: boolean
  /** The scene's own description, shown verbatim at the top of the review section. */
  sceneDescription?: string | null
  /** The agent's authored line about the recommended set. Shown verbatim; never synthesized here. */
  recommendationSummary?: string | null
  /** Settles every listed slot on its recommendation, in one write, as the user. */
  onAcceptRecommendations?: (choices: SceneRecommendationChoice[]) => void
  /** Set while the bulk accept is in flight - it belongs to no single slot, so busySlotId cannot express it. */
  acceptBusy?: boolean
  /** The candidate being previewed in the viewport, as `slotId/candidateId`. */
  previewRef: string | null
  onPreview: (slot: SceneSlotView, candidate: SceneSlotCandidateView) => void
  onChoose: (slotId: string, candidateId: string) => void
  onReject: (slotId: string, candidateIds: string[], reason: string) => void
  onRejectAll: (slotId: string, reason: string) => void
  onReopen: (slotId: string) => void
  /** Set while a write is in flight, so the panel does not accept a second click. */
  busySlotId: string | null
  /**
   * Why choosing is unavailable right now, or null. A choice is written to the
   * server immediately, so it cannot be taken while the editor holds unsaved
   * edits - saying so beats a button that fails.
   */
  blocked: string | null
}

export function SceneChoicesPanel({
  slots,
  isLoading,
  sceneDescription = null,
  recommendationSummary = null,
  onAcceptRecommendations,
  acceptBusy = false,
  previewRef,
  onPreview,
  onChoose,
  onReject,
  onRejectAll,
  onReopen,
  busySlotId,
  blocked,
}: SceneChoicesPanelProps): JSX.Element | null {
  // Nothing at all rather than an empty frame: most scenes are composed without
  // choices, and a permanent "no decisions" box would be chrome that never
  // earns its column width.
  if (!isLoading && slots.length === 0) {
    return null
  }

  return (
    <section className="scene-choices" data-testid="scene-choices">
      <h4>Choices</h4>

      {isLoading ? null : (
        <SceneIntent
          slots={slots}
          sceneDescription={sceneDescription}
          recommendationSummary={recommendationSummary}
          busy={busySlotId !== null || blocked !== null || acceptBusy}
          onAcceptRecommendations={onAcceptRecommendations}
        />
      )}

      {blocked ? (
        <p
          className="scene-choices-blocked"
          data-testid="scene-choices-blocked"
        >
          {blocked}
        </p>
      ) : null}

      {isLoading ? (
        <p className="scene-choices-note">Loading…</p>
      ) : (
        slots.map(slot => (
          <SlotBlock
            key={slot.slotId}
            slot={slot}
            previewRef={previewRef}
            busy={busySlotId === slot.slotId || blocked !== null}
            onPreview={onPreview}
            onChoose={onChoose}
            onReject={onReject}
            onRejectAll={onRejectAll}
            onReopen={onReopen}
          />
        ))
      )}
    </section>
  )
}

/**
 * Scene intent & recommendations - what the agent was aiming at, and what it
 * advises, above the cards.
 *
 * Every line here is an *authored* fact already in the scene or the slot view:
 * the scene's own description, the agent's summary, the counts, and each
 * recommended `slot/candidate` with the rationale it was proposed with. The
 * browser does not synthesize prose about a set of cards, and it does not ask
 * for or display private deliberation - there is no such field to show.
 *
 * With nothing recommended and no summary this stays a one-line status row
 * rather than an empty decorative panel.
 */
function SceneIntent({
  slots,
  sceneDescription,
  recommendationSummary,
  busy,
  onAcceptRecommendations,
}: {
  slots: SceneSlotView[]
  sceneDescription: string | null
  recommendationSummary: string | null
  busy: boolean
  onAcceptRecommendations?: (choices: SceneRecommendationChoice[]) => void
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(true)
  const [confirming, setConfirming] = useState(false)

  const unresolved = slots.filter(slot => slot.status === 'proposed').length
  const resolved = slots.filter(slot => slot.status === 'chosen').length
  const rejected = slots.filter(slot => slot.status === 'rejected').length

  // `recommendationAcceptable` is the server's answer, not a second copy of the
  // rule: it already accounts for the slot being unresolved and the candidate
  // being neither rejected nor a store proposal.
  const acceptable = slots.filter(slot => slot.recommendationAcceptable)

  const recommended = slots
    .map(slot => ({
      slot,
      candidate:
        slot.candidates.find(
          candidate => candidate.id === slot.recommendedCandidateId
        ) ?? null,
    }))
    .filter(
      (
        entry
      ): entry is { slot: SceneSlotView; candidate: SceneSlotCandidateView } =>
        entry.candidate !== null
    )

  const choices: SceneRecommendationChoice[] = acceptable.map(slot => ({
    slotId: slot.slotId,
    candidateId: slot.recommendedCandidateId as string,
  }))

  // Two is the threshold on purpose: accepting one recommendation is what the
  // card's own choose button already is, and a bulk action for it would be a
  // second path to the same write.
  const canAcceptAll =
    choices.length >= 2 && onAcceptRecommendations !== undefined

  if (slots.length === 0) {
    return null
  }

  return (
    <div className="scene-choices-intent" data-testid="scene-choices-intent">
      <button
        type="button"
        className="scene-choices-intent-head"
        aria-expanded={expanded}
        onClick={() => setExpanded(current => !current)}
      >
        <i
          className={`pi ${expanded ? 'pi-chevron-down' : 'pi-chevron-right'}`}
          aria-hidden="true"
        />
        <span className="scene-choices-intent-title">
          Scene intent &amp; recommendations
        </span>
        <span
          className="scene-choices-intent-counts"
          data-testid="scene-choices-counts"
        >
          {unresolved} open · {resolved} settled · {rejected} rejected
        </span>
      </button>

      {expanded ? (
        <div className="scene-choices-intent-body">
          {sceneDescription ? (
            <p className="scene-choices-intent-description">
              {sceneDescription}
            </p>
          ) : null}

          {recommendationSummary ? (
            <p
              className="scene-choices-intent-summary"
              data-testid="scene-choices-summary"
            >
              {recommendationSummary}
            </p>
          ) : null}

          {recommended.length > 0 ? (
            <ul className="scene-choices-intent-list">
              {recommended.map(({ slot, candidate }) => (
                <li key={slot.slotId}>
                  <span className="scene-choices-intent-ref">
                    {candidate.ref}
                  </span>
                  <span className="scene-choices-intent-label">
                    {candidate.label ??
                      candidate.facts?.name ??
                      candidate.storeAsset?.title ??
                      slot.slotId}
                  </span>
                  {/*
                    The rationale it was proposed with, not a new one. A
                    recommendation is a pointer at an existing candidate, so the
                    argument for it is the argument already on the card.
                  */}
                  {candidate.rationale ? (
                    <span className="scene-choices-intent-rationale">
                      {candidate.rationale}
                    </span>
                  ) : null}
                  {slot.chosenCandidateId !== null ? (
                    <span className="scene-choices-intent-outcome">
                      {slot.chosenCandidateId === candidate.id
                        ? 'followed'
                        : `overruled · chose ${slot.chosenCandidateId}`}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="scene-choices-note">
              Nothing is recommended yet. Every slot is still an open question.
            </p>
          )}

          {canAcceptAll ? (
            <Button
              label={`Accept ${choices.length} recommendations`}
              icon="pi pi-check-circle"
              size="small"
              disabled={busy}
              data-testid="scene-choices-accept-all"
              onClick={() => setConfirming(true)}
            />
          ) : null}
        </div>
      ) : null}

      {/*
        The exact mappings, before anything is written. "Accept all" is one
        irreversible-feeling action over several decisions, and the user has to
        be able to see which decisions those are - and to cancel and keep
        choosing card by card instead.
      */}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        header={`Accept ${choices.length} recommendations`}
      >
        <ul
          className="scene-choices-confirm-list"
          data-testid="scene-choices-confirm-list"
        >
          {acceptable.map(slot => (
            <li key={slot.slotId}>
              <strong>{slot.slotId}</strong> → {slot.recommendedCandidateId}
            </li>
          ))}
        </ul>
        <p className="scene-choices-note">
          These are recorded as your choices, not the agent&apos;s.
        </p>
        <div className="scene-choices-confirm-actions">
          <Button
            label="Accept"
            size="small"
            disabled={busy}
            data-testid="scene-choices-accept-confirm"
            onClick={() => {
              // The dialog can outlive the state that opened it - a link or a
              // slot write can start while it is on screen - so the decision to
              // send is taken here, against what is true now.
              setConfirming(false)
              if (busy) {
                return
              }
              onAcceptRecommendations?.(choices)
            }}
          />
          <Button
            label="Cancel"
            size="small"
            text
            onClick={() => setConfirming(false)}
          />
        </div>
      </Dialog>
    </div>
  )
}

function SlotBlock({
  slot,
  previewRef,
  busy,
  onPreview,
  onChoose,
  onReject,
  onRejectAll,
  onReopen,
}: {
  slot: SceneSlotView
  previewRef: string | null
  busy: boolean
  onPreview: (slot: SceneSlotView, candidate: SceneSlotCandidateView) => void
  onChoose: (slotId: string, candidateId: string) => void
  onReject: (slotId: string, candidateIds: string[], reason: string) => void
  onRejectAll: (slotId: string, reason: string) => void
  onReopen: (slotId: string) => void
}): JSX.Element {
  // Which rejection form is open, and what is typed in it. `all` is the "none
  // of these" form; a candidate id is that card's own. One at a time, because
  // two open reason boxes on one slot is two answers to one question.
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const open = slot.candidates.filter(candidate => !candidate.rejected)

  function submitRejection(): void {
    // `busy` is checked HERE, not only on the Reject button's disabled
    // attribute. This form also submits on Enter, and that path went straight
    // through: an open reason box plus a project link (or another slot write)
    // starting behind it was two writes racing for one revision, and whichever
    // lost came back as a conflict the user could not have caused. A disabled
    // button is styling; the rule belongs to the write.
    if (busy) {
      return
    }

    const trimmed = reason.trim()
    if (!trimmed || rejecting === null) {
      return
    }

    if (rejecting === 'all') {
      onRejectAll(slot.slotId, trimmed)
    } else {
      onReject(slot.slotId, [rejecting], trimmed)
    }

    setRejecting(null)
    setReason('')
  }

  return (
    <div
      className={`scene-choices-slot scene-choices-slot--${slot.status}`}
      data-testid={`scene-choices-slot-${slot.slotId}`}
    >
      <div className="scene-choices-slot-head">
        <span className="scene-choices-slot-id">{slot.slotId}</span>
        <span
          className={`scene-choices-status scene-choices-status--${slot.status}`}
        >
          {slot.status === 'chosen'
            ? `chosen · by ${slot.resolvedBy ?? 'unknown'}`
            : slot.status}
        </span>
      </div>

      {slot.brief ? <p className="scene-choices-brief">{slot.brief}</p> : null}

      {slot.reopenedReason ? (
        <p className="scene-choices-reopened">
          Round thrown out: {slot.reopenedReason}
        </p>
      ) : null}

      {slot.candidates.length === 0 ? (
        <EmptyState
          variant="compact"
          icon="pi pi-inbox"
          title="No proposals yet"
        />
      ) : (
        <ul className="scene-choices-cards">
          {slot.candidates.map(candidate => (
            <CandidateCard
              key={candidate.id}
              slot={slot}
              candidate={candidate}
              previewing={previewRef === candidate.ref}
              busy={busy}
              onPreview={onPreview}
              onChoose={onChoose}
              onReject={() => {
                setRejecting(candidate.id)
                setReason('')
              }}
            />
          ))}
        </ul>
      )}

      <div className="scene-choices-slot-actions">
        {open.length > 0 ? (
          <Button
            label="None of these"
            icon="pi pi-times-circle"
            size="small"
            text
            severity="danger"
            disabled={busy}
            data-testid={`scene-choices-none-${slot.slotId}`}
            onClick={() => {
              setRejecting('all')
              setReason('')
            }}
          />
        ) : null}

        {slot.chosenCandidateId ? (
          <Button
            label="Reopen"
            icon="pi pi-undo"
            size="small"
            text
            disabled={busy}
            onClick={() => {
              if (busy) {
                return
              }
              onReopen(slot.slotId)
            }}
          />
        ) : null}
      </div>

      {rejecting !== null ? (
        <div className="scene-choices-reason">
          <label htmlFor={`reason-${slot.slotId}`}>
            {rejecting === 'all'
              ? 'Why none of these work'
              : `Why ${slot.slotId}/${rejecting} does not work`}
          </label>
          {/*
            Required, not optional. The reason is the whole reason to record a
            rejection: it is what the agent reads back before proposing again,
            and a rejection without one teaches the next round nothing.
          */}
          <input
            id={`reason-${slot.slotId}`}
            className="scene-choices-reason-input"
            value={reason}
            autoFocus
            placeholder="too modern, too clean, wrong scale…"
            onChange={event => setReason(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                submitRejection()
              } else if (event.key === 'Escape') {
                setRejecting(null)
              }
            }}
          />
          <div className="scene-choices-reason-actions">
            <Button
              label="Reject"
              size="small"
              severity="danger"
              disabled={busy || reason.trim().length === 0}
              data-testid={`scene-choices-reject-confirm-${slot.slotId}`}
              onClick={submitRejection}
            />
            <Button
              label="Cancel"
              size="small"
              text
              onClick={() => setRejecting(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CandidateCard({
  slot,
  candidate,
  previewing,
  busy,
  onPreview,
  onChoose,
  onReject,
}: {
  slot: SceneSlotView
  candidate: SceneSlotCandidateView
  previewing: boolean
  busy: boolean
  onPreview: (slot: SceneSlotView, candidate: SceneSlotCandidateView) => void
  onChoose: (slotId: string, candidateId: string) => void
  onReject: () => void
}): JSX.Element {
  const classes = [
    'scene-choices-card',
    candidate.chosen ? 'scene-choices-card--chosen' : '',
    // Marked, deliberately not styled as selected: "recommended" and "chosen"
    // are different states, and a recommended card that looked chosen would
    // misreport who decided.
    candidate.recommended ? 'scene-choices-card--recommended' : '',
    candidate.rejected ? 'scene-choices-card--rejected' : '',
    previewing ? 'scene-choices-card--previewing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={classes} data-testid={`scene-choices-card-${candidate.ref}`}>
      {/*
        Clicking the body previews it in place. A preview is a local swap and
        never a write: the user has to be able to look at four options without
        moving the scene's revision four times, and without disturbing anything
        else they already settled.
      */}
      <button
        type="button"
        className="scene-choices-card-body"
        disabled={candidate.rejected}
        onClick={() => onPreview(slot, candidate)}
      >
        <span className="scene-choices-card-head">
          <CandidateMedia candidate={candidate} />
          <span className="scene-choices-card-heading">
            <span className="scene-choices-card-ref">{candidate.ref}</span>
            {candidate.recommended ? (
              <span
                className="scene-choices-card-recommended"
                data-testid={`scene-choices-recommended-${candidate.ref}`}
              >
                Recommended
              </span>
            ) : null}
            <span className="scene-choices-card-name">
              {candidate.label ??
                candidate.storeAsset?.title ??
                candidate.facts?.name ??
                assetLabel(candidate)}
            </span>
          </span>
        </span>

        {candidate.storeAsset ? (
          <span className="scene-choices-card-store">
            <span className="scene-choices-card-store-badge">
              Not in your library
            </span>
            <span className="scene-choices-card-store-price">
              {formatPrice(
                candidate.storeAsset.price,
                candidate.storeAsset.currency
              )}
            </span>
          </span>
        ) : null}

        {candidate.rationale ? (
          <span className="scene-choices-card-rationale">
            {candidate.rationale}
          </span>
        ) : null}

        <CandidateNumbers facts={candidate.facts} />

        {candidate.rejected ? (
          <span className="scene-choices-card-rejected">
            Rejected: {candidate.rejectedReason}
          </span>
        ) : null}
      </button>

      {candidate.rejected ? null : (
        <div className="scene-choices-card-actions">
          {/*
            A store candidate has no local asset to put on the node, so choosing
            it is not the same one-click act - it has to be acquired first, and
            that is the user's call in the store, not a button here that would
            fail. The card says so instead of offering a choice it cannot honour.
          */}
          <Button
            icon="pi pi-check"
            size="small"
            text={!candidate.chosen}
            aria-label={`Choose ${candidate.ref}`}
            tooltip={
              candidate.chosen
                ? 'Chosen'
                : candidate.choosable
                  ? `Choose ${candidate.ref}`
                  : 'Import it from the store first - a store asset is not in this library yet'
            }
            disabled={busy || candidate.chosen || !candidate.choosable}
            data-testid={`scene-choices-choose-${candidate.ref}`}
            onClick={() => {
              // Same rule as the reason box: the condition that makes this
              // unsafe is about the write, so it is enforced where the write is
              // started rather than only where the button is styled.
              if (busy || candidate.chosen || !candidate.choosable) {
                return
              }
              onChoose(slot.slotId, candidate.id)
            }}
          />
          <Button
            icon="pi pi-times"
            size="small"
            text
            severity="danger"
            aria-label={`Reject ${candidate.ref}`}
            tooltip={`Reject ${candidate.ref}`}
            disabled={busy}
            onClick={onReject}
          />
        </div>
      )}
    </li>
  )
}

/**
 * The picture, resolved server-side and drawn here.
 *
 * A store candidate's thumbnail is an absolute URL on another host and is used as
 * given; a library one is API-relative and goes through the same resolver every
 * other asset image in the app uses. A thumbnail that is still rendering says so
 * rather than showing a broken image, because "not yet" and "never" are different
 * answers about the same asset.
 */
function CandidateMedia({
  candidate,
}: {
  candidate: SceneSlotCandidateView
}): JSX.Element {
  const media: SceneCandidateMedia | null = candidate.media
  const storeUrl =
    media?.storeThumbnailUrl ?? candidate.storeAsset?.thumbnailUrl
  const assetUrl = media?.assetThumbnailUrl
    ? resolveApiAssetUrl(media.assetThumbnailUrl)
    : null
  const materialUrl = media?.materialThumbnailUrl
    ? resolveApiAssetUrl(media.materialThumbnailUrl)
    : null
  const swatch = media?.materialSwatch ?? null

  // The asset is the primary image; a surface-only candidate promotes its
  // material to primary, because a card with no picture at all is the thing this
  // whole part exists to remove.
  const primary = storeUrl ?? assetUrl
  const secondary = primary ? (materialUrl ?? null) : null

  return (
    <span
      className="scene-choices-card-media"
      data-testid="scene-choices-card-media"
    >
      {primary ? (
        <img src={primary} alt="" loading="lazy" />
      ) : materialUrl ? (
        <img src={materialUrl} alt="" loading="lazy" />
      ) : swatch ? (
        <MaterialSwatch
          parameters={{
            baseColorHex: swatch.baseColorHex,
            roughness: swatch.roughness,
            metallic: swatch.metallic,
            baseColorA: swatch.opacity,
            alphaMode: swatch.opacity < 1 ? 'Blend' : 'Opaque',
          }}
        />
      ) : (
        <span
          className="scene-choices-card-media-empty"
          title={
            media?.assetThumbnailStatus === 'pending'
              ? 'Thumbnail is still rendering'
              : 'No preview for this candidate'
          }
        >
          <i
            className={
              media?.assetThumbnailStatus === 'pending'
                ? 'pi pi-hourglass'
                : 'pi pi-image'
            }
          />
        </span>
      )}

      {secondary && swatch === null ? (
        <img
          className="scene-choices-card-media-material"
          src={secondary}
          alt=""
          loading="lazy"
        />
      ) : null}

      {secondary === null && primary && swatch ? (
        <span className="scene-choices-card-media-material">
          <MaterialSwatch
            parameters={{
              baseColorHex: swatch.baseColorHex,
              roughness: swatch.roughness,
              metallic: swatch.metallic,
              baseColorA: swatch.opacity,
              alphaMode: swatch.opacity < 1 ? 'Blend' : 'Opaque',
            }}
          />
        </span>
      ) : null}
    </span>
  )
}

/** Free is worth saying out loud: it is the only price an agent can act on by itself. */
function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined
): string {
  if (price === null || price === undefined) {
    return 'price unknown'
  }
  return price === 0 ? 'Free' : `${price.toFixed(2)} ${currency ?? 'USD'}`
}

/**
 * The facts that catch a plausible-sounding wrong answer.
 *
 * Cameras and lights are called out separately from the part count because they
 * are the tell for the specific mistake that shipped a scene: a search hit named
 * "carpet" that was a part of a twelve-object Khronos test scene, placed whole
 * and squashed to the part's dimensions, with every spatial check passing.
 */
function CandidateNumbers({
  facts,
}: {
  facts: SceneCandidateFacts | null
}): JSX.Element {
  if (!facts) {
    return (
      <span className="scene-choices-card-facts scene-choices-card-facts--unknown">
        Nothing extracted for this asset yet
      </span>
    )
  }

  const chips: string[] = []

  if (facts.dimensions) {
    chips.push(
      `${metres(facts.dimensions.x)} × ${metres(facts.dimensions.y)} × ${metres(facts.dimensions.z)} m`
    )
  }
  if (facts.partCount != null) {
    chips.push(`${facts.partCount} part${facts.partCount === 1 ? '' : 's'}`)
  }
  if (facts.materialCount != null) {
    chips.push(`${facts.materialCount} mat`)
  }
  if (facts.cameras > 0) {
    chips.push(`${facts.cameras} camera${facts.cameras === 1 ? '' : 's'}`)
  }
  if (facts.lights > 0) {
    chips.push(`${facts.lights} light${facts.lights === 1 ? '' : 's'}`)
  }

  return (
    <span className="scene-choices-card-facts">
      {chips.join(' · ')}
      {facts.qualityFlags?.length ? (
        <span className="scene-choices-card-flags">
          {facts.qualityFlags.join(' ')}
        </span>
      ) : null}
    </span>
  )
}

function metres(value: number): string {
  return value.toFixed(2)
}

function assetLabel(candidate: SceneSlotCandidateView): string {
  if (candidate.asset) {
    return `${candidate.asset.assetType} ${candidate.asset.assetId}`
  }
  return 'material only'
}
