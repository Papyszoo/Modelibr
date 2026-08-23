import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/renderWithProviders'

import type { SceneSlotCandidateView, SceneSlotView } from '../../types'
import { SceneChoicesPanel } from '../SceneChoicesPanel'

function candidate(
  overrides: Partial<SceneSlotCandidateView> = {}
): SceneSlotCandidateView {
  const id = overrides.id ?? 'A'
  return {
    id,
    ref: `streetlight/${id}`,
    label: null,
    asset: { assetType: 'Model', assetId: 12, versionId: 34 },
    material: null,
    rationale: 'reads as rundown',
    chosen: false,
    rejected: false,
    rejectedReason: null,
    facts: {
      name: 'Lamp Post 03',
      dimensions: { x: 0.4, y: 4.2, z: 0.4 },
      partCount: 3,
      materialCount: 1,
      qualityFlags: null,
      cameras: 0,
      lights: 0,
    },
    storeAsset: null,
    choosable: true,
    media: null,
    recommended: false,
    ...overrides,
  }
}

function slot(overrides: Partial<SceneSlotView> = {}): SceneSlotView {
  return {
    slotId: 'streetlight',
    nodeId: 'lamp-1',
    brief: 'low-poly, under 3k tris',
    status: 'proposed',
    chosenCandidateId: null,
    resolvedBy: null,
    reopenedReason: null,
    candidates: [candidate({ id: 'A' }), candidate({ id: 'B' })],
    recommendedCandidateId: null,
    recommendationAcceptable: false,
    ...overrides,
  }
}

function renderPanel(
  slots: SceneSlotView[],
  overrides: Partial<Parameters<typeof SceneChoicesPanel>[0]> = {}
) {
  const props = {
    slots,
    isLoading: false,
    previewRef: null,
    onPreview: jest.fn(),
    onChoose: jest.fn(),
    onReject: jest.fn(),
    onRejectAll: jest.fn(),
    onReopen: jest.fn(),
    busySlotId: null,
    blocked: null,
    ...overrides,
  }

  renderWithProviders(<SceneChoicesPanel {...props} />)
  return props
}

describe('SceneChoicesPanel', () => {
  it('shows each candidate by the name the user says out loud', () => {
    // The requirement's core: the handle is on the card, verbatim. A card
    // identified by its position stops meaning anything the moment one is
    // rejected and the next round is proposed.
    renderPanel([slot()])

    expect(screen.getByText('streetlight/A')).toBeInTheDocument()
    expect(screen.getByText('streetlight/B')).toBeInTheDocument()
  })

  it('marks a store candidate as not owned and refuses to choose it', async () => {
    // The inversion this whole part protects: a store proposal is a suggestion
    // to acquire something, not a one-click choice. Offering the same Choose
    // button would promise a write the server refuses.
    renderPanel([
      slot({
        candidates: [
          candidate({
            id: 'A',
            asset: null,
            facts: null,
            choosable: false,
            storeAsset: {
              storeUrl: 'https://store.modelibr.com',
              storeAssetId: '47f60614-522f-4ced-941c-318ac5c7bd34',
              title: 'Quaternius: Ultimate Furniture Pack',
              thumbnailUrl:
                'https://store.modelibr.com/api/assets/x/previews/y',
              price: 0,
              currency: 'USD',
            },
          }),
        ],
      }),
    ])

    expect(screen.getByText('Not in your library')).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(
      screen.getByText('Quaternius: Ultimate Furniture Pack')
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('scene-choices-choose-streetlight/A')
    ).toBeDisabled()
  })

  it('shows a paid store candidate at its price', () => {
    renderPanel([
      slot({
        candidates: [
          candidate({
            id: 'A',
            asset: null,
            facts: null,
            choosable: false,
            storeAsset: {
              storeUrl: 'https://store.modelibr.com',
              storeAssetId: 'paid-1',
              title: "Someone else's sofa",
              thumbnailUrl: null,
              price: 4.99,
              currency: 'USD',
            },
          }),
        ],
      }),
    ])

    expect(screen.getByText('4.99 USD')).toBeInTheDocument()
  })

  it('says a thumbnail is still rendering rather than showing a broken image', () => {
    renderPanel([
      slot({
        candidates: [
          candidate({
            id: 'A',
            media: {
              assetThumbnailUrl: null,
              assetThumbnailStatus: 'pending',
              materialThumbnailUrl: null,
              materialSwatch: null,
              storeThumbnailUrl: null,
            },
          }),
        ],
      }),
    ])

    expect(
      screen.getByTitle('Thumbnail is still rendering')
    ).toBeInTheDocument()
  })

  it('draws a parameter material as a swatch when there is no image', () => {
    renderPanel([
      slot({
        candidates: [
          candidate({
            id: 'A',
            asset: null,
            facts: null,
            media: {
              assetThumbnailUrl: null,
              assetThumbnailStatus: 'unknown',
              materialThumbnailUrl: null,
              materialSwatch: {
                baseColorHex: '#8b5a2b',
                roughness: 0.6,
                metallic: 0,
                opacity: 1,
              },
              storeThumbnailUrl: null,
            },
          }),
        ],
      }),
    ])

    expect(screen.getByTestId('material-swatch')).toBeInTheDocument()
  })

  it('shows the numbers next to the rationale', () => {
    // A rationale on its own is a plausible sentence about an asset nobody
    // measured - which is exactly what a user cannot overrule.
    renderPanel([slot()])

    expect(screen.getAllByText('reads as rundown')).toHaveLength(2)
    expect(
      screen.getAllByText(/0\.40 × 4\.20 × 0\.40 m · 3 parts · 1 mat/)
    ).toHaveLength(2)
  })

  it('calls out an asset that is really a whole sample scene', () => {
    renderPanel([
      slot({
        candidates: [
          candidate({
            id: 'A',
            facts: {
              name: 'PlaysetLightTest',
              dimensions: { x: 12, y: 6, z: 9 },
              partCount: 12,
              materialCount: 4,
              qualityFlags: ['missing_uvs'],
              cameras: 1,
              lights: 2,
            },
          }),
        ],
      }),
    ])

    expect(screen.getByText(/1 camera · 2 lights/)).toBeInTheDocument()
    expect(screen.getByText('missing_uvs')).toBeInTheDocument()
  })

  it('keeps a rejected candidate visible with its reason', async () => {
    // Rejections are feedback, not deletions. The user sees what was already
    // ruled out, and so does the agent reading the slot back.
    renderPanel([
      slot({
        candidates: [
          candidate({ id: 'A' }),
          candidate({ id: 'B', rejected: true, rejectedReason: 'too modern' }),
        ],
      }),
    ])

    expect(screen.getByText('streetlight/B')).toBeInTheDocument()
    expect(screen.getByText('Rejected: too modern')).toBeInTheDocument()
    expect(
      screen.queryByTestId('scene-choices-choose-streetlight/B')
    ).not.toBeInTheDocument()
  })

  it('previews a candidate in place without writing anything', async () => {
    const props = renderPanel([slot()])

    await userEvent.click(screen.getByText('streetlight/B'))

    expect(props.onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ slotId: 'streetlight' }),
      expect.objectContaining({ id: 'B' })
    )
    expect(props.onChoose).not.toHaveBeenCalled()
  })

  it('chooses a candidate by its id', async () => {
    const props = renderPanel([slot()])

    await userEvent.click(
      screen.getByTestId('scene-choices-choose-streetlight/B')
    )

    expect(props.onChoose).toHaveBeenCalledWith('streetlight', 'B')
  })

  it('will not reject anything until a reason is given', async () => {
    // The reason is the whole point of recording a rejection: it is what the
    // agent reads back before proposing again.
    const props = renderPanel([slot()])

    await userEvent.click(screen.getByTestId('scene-choices-none-streetlight'))

    const confirm = screen.getByTestId(
      'scene-choices-reject-confirm-streetlight'
    )
    expect(confirm).toBeDisabled()

    await userEvent.type(
      screen.getByLabelText('Why none of these work'),
      'all too modern'
    )
    await userEvent.click(confirm)

    expect(props.onRejectAll).toHaveBeenCalledWith(
      'streetlight',
      'all too modern'
    )
  })

  it('says who settled a decision', async () => {
    // "The agent proposes, the user decides" is only a guarantee while the
    // scene can say which of the two happened.
    renderPanel([
      slot({
        status: 'chosen',
        chosenCandidateId: 'B',
        resolvedBy: 'agent',
        candidates: [
          candidate({ id: 'A' }),
          candidate({ id: 'B', chosen: true }),
        ],
      }),
    ])

    expect(screen.getByText('chosen · by agent')).toBeInTheDocument()
  })

  it('shows the reason a whole round was thrown out', () => {
    renderPanel([
      slot({
        status: 'rejected',
        reopenedReason: 'all too modern',
        candidates: [
          candidate({
            id: 'A',
            rejected: true,
            rejectedReason: 'all too modern',
          }),
        ],
      }),
    ])

    expect(
      screen.getByText('Round thrown out: all too modern')
    ).toBeInTheDocument()
  })

  it('renders nothing when the scene has no decisions', () => {
    // Most scenes are composed without choices, and a permanent "no decisions"
    // box would be chrome that never earns its column width.
    renderPanel([])

    expect(screen.queryByTestId('scene-choices')).not.toBeInTheDocument()
  })

  it('refuses to write while the editor holds unsaved edits, and says why', () => {
    renderPanel([slot()], { blocked: 'Save your edits before choosing.' })

    expect(
      screen.getByText('Save your edits before choosing.')
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('scene-choices-choose-streetlight/B')
    ).toBeDisabled()
  })

  it('marks a recommended card without making it look chosen', () => {
    // "Recommended" and "chosen" are different states. A recommended card that
    // read as selected would tell the user a decision had been made for them.
    renderPanel([
      slot({
        recommendedCandidateId: 'B',
        recommendationAcceptable: true,
        candidates: [
          candidate({ id: 'A' }),
          candidate({ id: 'B', recommended: true }),
        ],
      }),
    ])

    expect(
      screen.getByTestId('scene-choices-recommended-streetlight/B')
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('scene-choices-choose-streetlight/B')
    ).toBeEnabled()
  })

  it('shows the authored summary verbatim rather than composing one', () => {
    renderPanel([slot()], {
      recommendationSummary:
        'warm walnut and matte brass keep the room cohesive',
    })

    expect(screen.getByTestId('scene-choices-summary')).toHaveTextContent(
      'warm walnut and matte brass keep the room cohesive'
    )
  })

  it('offers no bulk accept for a single recommendation', () => {
    // One recommendation is what the card's own choose button already is; a
    // bulk action for it would be a second path to the same write.
    renderPanel(
      [
        slot({
          recommendedCandidateId: 'B',
          recommendationAcceptable: true,
          candidates: [
            candidate({ id: 'A' }),
            candidate({ id: 'B', recommended: true }),
          ],
        }),
      ],
      { onAcceptRecommendations: jest.fn() }
    )

    expect(
      screen.queryByTestId('scene-choices-accept-all')
    ).not.toBeInTheDocument()
  })

  it('lists the exact mappings before accepting them, and sends only those', async () => {
    const onAcceptRecommendations = jest.fn()
    renderPanel(
      [
        slot({
          slotId: 'streetlight',
          recommendedCandidateId: 'B',
          recommendationAcceptable: true,
          candidates: [
            candidate({ id: 'A' }),
            candidate({ id: 'B', recommended: true }),
          ],
        }),
        slot({
          slotId: 'bench',
          nodeId: 'bench-1',
          recommendedCandidateId: 'A',
          recommendationAcceptable: true,
          candidates: [candidate({ id: 'A', recommended: true })],
        }),
        // Recommended, but its candidate was rejected - kept as history and
        // excluded from the bulk accept, which is the server's own verdict.
        slot({
          slotId: 'rug',
          nodeId: 'rug-1',
          recommendedCandidateId: 'A',
          recommendationAcceptable: false,
          candidates: [
            candidate({
              id: 'A',
              recommended: true,
              rejected: true,
              rejectedReason: 'too modern',
            }),
          ],
        }),
      ],
      { onAcceptRecommendations }
    )

    await userEvent.click(screen.getByTestId('scene-choices-accept-all'))
    const listed = screen.getByTestId('scene-choices-confirm-list')
    expect(listed).toHaveTextContent('streetlight → B')
    expect(listed).toHaveTextContent('bench → A')
    expect(listed).not.toHaveTextContent('rug')

    await userEvent.click(screen.getByTestId('scene-choices-accept-confirm'))

    expect(onAcceptRecommendations).toHaveBeenCalledWith([
      { slotId: 'streetlight', candidateId: 'B' },
      { slotId: 'bench', candidateId: 'A' },
    ])
  })

  it('says whether the user followed the recommendation or overruled it', () => {
    renderPanel([
      slot({
        status: 'chosen',
        resolvedBy: 'user',
        chosenCandidateId: 'A',
        recommendedCandidateId: 'B',
        recommendationAcceptable: false,
        candidates: [
          candidate({ id: 'A', chosen: true }),
          candidate({ id: 'B', recommended: true }),
        ],
      }),
    ])

    expect(screen.getByText('overruled · chose A')).toBeInTheDocument()
  })
})
