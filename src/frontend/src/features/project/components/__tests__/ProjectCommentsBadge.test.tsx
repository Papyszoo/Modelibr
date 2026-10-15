import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ProjectCommentsBadge } from '../ProjectCommentsBadge'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock

const noTarget = {
  levelId: null,
  referenceImageId: null,
  characterId: null,
  modelId: null,
  textureSetId: null,
  spriteId: null,
  soundId: null,
  environmentMapId: null,
  vfxId: null,
}

const comment = (overrides: Record<string, unknown>) => ({
  ...noTarget,
  id: 1,
  projectId: 7,
  title: 'Scale',
  body: 'Twice too large next to the door.',
  isPinned: false,
  status: 'open',
  resolution: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
})

describe('ProjectCommentsBadge', () => {
  let stored: ReturnType<typeof comment>[]

  beforeEach(() => {
    jest.clearAllMocks()
    stored = [
      comment({ id: 1, modelId: 12 }),
      comment({ id: 2, modelId: 12, status: 'resolved', title: 'Colour' }),
      // Same id, other kind: must not count towards model 12.
      comment({ id: 3, spriteId: 12, title: 'Sprite remark' }),
    ]
    mockGet.mockImplementation((url: string) =>
      url === '/projects/7/comments'
        ? Promise.resolve({ data: stored })
        : Promise.reject(new Error(`unexpected GET ${url}`))
    )
    mockPost.mockImplementation((_url: string, body: object) => {
      const created = comment({ id: 4, ...body })
      stored = [...stored, created]
      return Promise.resolve({ data: created })
    })
  })

  // Counting by id alone would let a sprite's comment show on the model with
  // the same id; counting resolved ones would keep a fixed issue looking open.
  it("counts only the target's open comments", async () => {
    renderWithProviders(
      <ProjectCommentsBadge
        projectId={7}
        target={{ kind: 'modelId', id: 12 }}
        targetName="Crate"
      />
    )

    await waitFor(() =>
      expect(screen.getByTestId('project-comments-badge')).toHaveAttribute(
        'data-open-count',
        '1'
      )
    )
    expect(
      screen.getByRole('button', { name: 'Comments on Crate: 1 open' })
    ).toBeVisible()
  })

  // The panel is portalled, but React bubbles its events through the badge: a
  // click or keystroke in it reaching the card would open the asset instead.
  it('adds a comment on the asset from its panel without reaching the card', async () => {
    const onCardClick = jest.fn()
    renderWithProviders(
      <div onClick={onCardClick} onKeyDown={onCardClick}>
        <ProjectCommentsBadge
          projectId={7}
          target={{ kind: 'modelId', id: 12 }}
          targetName="Crate"
        />
      </div>
    )

    await userEvent.click(
      await screen.findByRole('button', { name: 'Comments on Crate: 1 open' })
    )
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Scale')).toBeVisible()
    expect(within(panel).getByText('Colour').closest('article')).toHaveClass(
      'is-resolved'
    )
    expect(within(panel).queryByText('Sprite remark')).not.toBeInTheDocument()

    await userEvent.type(
      within(panel).getByLabelText('Comment title for Crate'),
      'Pivot'
    )
    await userEvent.type(
      within(panel).getByLabelText('Comment for Crate'),
      'The pivot sits off the base.'
    )
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Add comment' })
    )

    expect(mockPost).toHaveBeenCalledWith('/projects/7/comments', {
      modelId: 12,
      title: 'Pivot',
      body: 'The pivot sits off the base.',
      isPinned: false,
    })
    // The list is refetched, so the badge reflects the new open comment.
    await waitFor(() =>
      expect(screen.getByTestId('project-comments-badge')).toHaveAttribute(
        'data-open-count',
        '2'
      )
    )
    expect(onCardClick).not.toHaveBeenCalled()
  })
})
