import './ProjectProfileSection.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { InputNumber } from 'primereact/inputnumber'
import { type JSX, useEffect, useMemo, useState } from 'react'

import {
  createProjectProfileOption,
  setProjectProfile,
} from '@/features/project/api/projectApi'
import {
  useProjectBriefQuery,
  useProjectProfileOptionsQuery,
} from '@/features/project/api/queries'
import { TagInput } from '@/shared/components/tags/TagInput'
import type {
  ProjectBriefDto,
  ProjectProfileOptionDto,
  ProjectProfileValueDto,
} from '@/types'

/**
 * What a project is: which engines and platforms it targets, what genre and look
 * it is going for, and how much geometry an asset may spend.
 *
 * This is the input side of the honesty feature. The agent's brief is assembled
 * from exactly these fields, and the read-only half below shows the brief back -
 * so when a search ranks something oddly, the reason is on the same page rather
 * than inferred from the result.
 *
 * The dimensions are closed-ish vocabularies, so the picker is `TagInput` with
 * `options`, grown rather than forked: adding a value the vocabulary does not
 * have creates it first and comes back with a real option id, because the server
 * stores an id and a free-text string would have nothing to store.
 */
const DIMENSIONS: { key: string; label: string; hint: string }[] = [
  {
    key: 'engine',
    label: 'Engines',
    hint: 'What this is authored in and what it runs in. Several is normal.',
  },
  {
    key: 'platform',
    label: 'Platforms',
    hint: 'The tightest one decides the suggested budget.',
  },
  { key: 'genre', label: 'Genres', hint: 'What kind of thing is being made.' },
  {
    key: 'style',
    label: 'Styles',
    hint: 'Ranks search results and is checked against every asset choice.',
  },
  {
    key: 'perspective',
    label: 'Camera',
    hint: 'How the player sees the world.',
  },
]

interface ProjectProfileSectionProps {
  projectId: number
  showToast: (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }) => void
}

type Draft = Record<string, ProjectProfileValueDto[]>

export function ProjectProfileSection({
  projectId,
  showToast,
}: ProjectProfileSectionProps): JSX.Element {
  const queryClient = useQueryClient()
  const { data: brief, isLoading } = useProjectBriefQuery({ projectId })
  const { data: options = [] } = useProjectProfileOptionsQuery()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [budget, setBudget] = useState<{
    maxTrianglesPerAsset: number | null
    maxTextureSize: number | null
    targetSceneTriangles: number | null
  } | null>(null)

  // Server state is the source of truth; the draft only exists between an edit
  // and a save. Re-seeding on every brief change is what makes "Discard" free.
  useEffect(() => {
    if (!brief) {
      return
    }
    setDraft(seed(brief))
    setBudget({
      maxTrianglesPerAsset: brief.budget.maxTrianglesPerAsset,
      maxTextureSize: brief.budget.maxTextureSize,
      targetSceneTriangles: brief.budget.targetSceneTriangles,
    })
  }, [brief])

  const byDimension = useMemo(() => {
    const grouped = new Map<string, ProjectProfileOptionDto[]>()
    for (const option of options) {
      if (option.isHidden) {
        continue
      }
      const key = option.dimension.toLowerCase()
      grouped.set(key, [...(grouped.get(key) ?? []), option])
    }
    return grouped
  }, [options])

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['projects', 'brief', projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['projects', 'profile-options'],
      }),
    ])

  const save = useMutation({
    mutationFn: () =>
      setProjectProfile(projectId, {
        dimensions: Object.fromEntries(
          DIMENSIONS.map(({ key }) => [
            key,
            (draft?.[key] ?? []).map(value => ({
              optionId: value.optionId,
              role: value.role ?? null,
            })),
          ])
        ),
        settings: {
          maxTrianglesPerAsset: budget?.maxTrianglesPerAsset ?? null,
          maxTextureSize: budget?.maxTextureSize ?? null,
          targetSceneTriangles: budget?.targetSceneTriangles ?? null,
        },
      }),
    onSuccess: async () => {
      await invalidate()
      showToast({
        severity: 'success',
        summary: 'Profile saved',
        detail: 'The agent reads the new brief on its next call.',
        life: 3000,
      })
    },
    onError: () =>
      showToast({
        severity: 'error',
        summary: 'Could not save the profile',
        detail: 'Nothing was changed.',
        life: 5000,
      }),
  })

  // A value outside the vocabulary is created first, then selected. The two
  // steps are the reason this is a mutation rather than a local push: the field
  // stores an option id, and a name with no id is nothing the server can keep.
  const createOption = useMutation({
    mutationFn: ({ dimension, name }: { dimension: string; name: string }) =>
      createProjectProfileOption(dimension, name),
    onSuccess: async (option, { dimension }) => {
      await invalidate()
      setDraft(current => ({
        ...(current ?? {}),
        [dimension]: [
          ...(current?.[dimension] ?? []),
          { optionId: option.id, name: option.name, role: null },
        ],
      }))
    },
    onError: () =>
      showToast({
        severity: 'error',
        summary: 'Could not add that option',
        detail: 'It may already exist under a different spelling.',
        life: 5000,
      }),
  })

  if (isLoading || !brief || !draft || !budget) {
    return <p className="project-profile-note">Loading profile…</p>
  }

  const suggestion = brief.budgetSuggestion

  return (
    <div className="project-profile" data-testid="project-profile">
      <div className="container-rich-header-row">
        <div>
          <span className="container-rich-kicker">Profile</span>
          <h3>What is being made</h3>
        </div>
        <Button
          label={save.isPending ? 'Saving…' : 'Save profile'}
          icon="pi pi-save"
          disabled={save.isPending}
          data-testid="project-profile-save"
          onClick={() => save.mutate()}
        />
      </div>

      {DIMENSIONS.map(({ key, label, hint }) => {
        const dimensionOptions = byDimension.get(key) ?? []
        const selected = draft[key] ?? []

        return (
          <div className="project-profile-row" key={key}>
            <label htmlFor={`profile-${key}`}>{label}</label>
            <p className="project-profile-hint">{hint}</p>
            <TagInput
              inputTestId={`profile-${key}`}
              value={selected.map(value => value.name)}
              options={dimensionOptions.map(option => option.name)}
              allowCustom
              suggestionsLabel={`${label} in this library`}
              placeholder={`Add ${label.toLowerCase()}…`}
              onCreateOption={name =>
                createOption.mutate({ dimension: key, name })
              }
              onChange={names => {
                const known = new Map(
                  dimensionOptions.map(option => [
                    option.name.toLowerCase(),
                    option,
                  ])
                )
                setDraft(current => ({
                  ...(current ?? {}),
                  [key]: names.flatMap(name => {
                    const option = known.get(name.toLowerCase())
                    if (!option) {
                      return []
                    }
                    // Keep the role a value already carried - the engine roles
                    // are the one thing a chip list cannot re-derive from a name.
                    const existing = (current?.[key] ?? []).find(
                      value => value.optionId === option.id
                    )
                    return [
                      {
                        optionId: option.id,
                        name: option.name,
                        role: existing?.role ?? null,
                      },
                    ]
                  }),
                }))
              }}
            />
          </div>
        )
      })}

      <div className="project-profile-row">
        <label>Budgets</label>
        <p className="project-profile-hint">
          What one asset, and a whole scene, may spend. Empty means
          unconstrained.
        </p>

        {/*
          The suggestion is a hint beside an empty field, never a value written
          for the user. The platform it comes from is named, because "5,000"
          with no reason attached is a number nobody can argue with.
        */}
        {suggestion ? (
          <p className="project-profile-suggestion">
            <span data-testid="project-profile-suggestion">
              {suggestion.note}
            </span>
            <Button
              label="Use it"
              size="small"
              text
              data-testid="project-profile-accept-suggestion"
              onClick={() =>
                setBudget(current => ({
                  ...(current ?? {
                    maxTrianglesPerAsset: null,
                    maxTextureSize: null,
                    targetSceneTriangles: null,
                  }),
                  maxTrianglesPerAsset: suggestion.maxTrianglesPerAsset,
                  maxTextureSize: suggestion.maxTextureSize,
                }))
              }
            />
          </p>
        ) : null}

        <div className="project-profile-budgets">
          <BudgetField
            id="budget-triangles"
            label="Triangles per asset"
            value={budget.maxTrianglesPerAsset}
            onChange={value =>
              setBudget({ ...budget, maxTrianglesPerAsset: value })
            }
          />
          <BudgetField
            id="budget-texture"
            label="Texture size (px)"
            value={budget.maxTextureSize}
            onChange={value => setBudget({ ...budget, maxTextureSize: value })}
          />
          <BudgetField
            id="budget-scene"
            label="Triangles per scene"
            value={budget.targetSceneTriangles}
            onChange={value =>
              setBudget({ ...budget, targetSceneTriangles: value })
            }
          />
        </div>
      </div>

      <ProjectBrief brief={brief} />
    </div>
  )
}

function BudgetField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number | null
  onChange: (value: number | null) => void
}): JSX.Element {
  return (
    <div className="project-profile-budget-field">
      <label htmlFor={id}>{label}</label>
      <InputNumber
        inputId={id}
        value={value}
        min={0}
        useGrouping
        placeholder="unconstrained"
        onValueChange={event => onChange(event.value ?? null)}
      />
    </div>
  )
}

/**
 * The brief, verbatim.
 *
 * This is the honesty half: when the agent picks something odd, the user reads
 * the exact input that produced it. Nothing here is composed in the browser -
 * every line is a string the server put in the brief.
 */
function ProjectBrief({ brief }: { brief: ProjectBriefDto }): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="project-profile-brief">
      <button
        type="button"
        className="project-profile-brief-head"
        aria-expanded={open}
        data-testid="project-profile-brief-toggle"
        onClick={() => setOpen(current => !current)}
      >
        <i
          className={`pi ${open ? 'pi-chevron-down' : 'pi-chevron-right'}`}
          aria-hidden="true"
        />
        <span>Agent brief</span>
        <span className="project-profile-hint">
          exactly what the agent is given
        </span>
      </button>

      {open ? (
        <div
          className="project-profile-brief-body"
          data-testid="project-profile-brief"
        >
          {brief.guidance.length > 0 ? (
            <ul>
              {brief.guidance.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="project-profile-note">
              This profile says nothing yet, so the agent is given nothing to go
              on.
            </p>
          )}

          <dl>
            <dt>World</dt>
            <dd>
              {brief.worldConvention.unitsPerMetre} units/m,{' '}
              {brief.worldConvention.upAxis} up,{' '}
              {brief.worldConvention.handedness}-handed
              {brief.worldConvention.isDefault ? ' (default)' : ''}
            </dd>

            {brief.worldConvention.engineConversions.map(line => (
              <dd key={line}>{line}</dd>
            ))}

            {/*
              Conflicts are stated, never resolved. "Works in both" is a
              constraint the user has to see - the app cannot pick for them.
            */}
            {brief.worldConvention.conflicts.length > 0 ? (
              <>
                <dt>Engines disagree</dt>
                {brief.worldConvention.conflicts.map(line => (
                  <dd key={line} className="project-profile-conflict">
                    {line}
                  </dd>
                ))}
              </>
            ) : null}

            {brief.styleSignals.boostTokens.length > 0 ? (
              <>
                <dt>Search prefers</dt>
                <dd>{brief.styleSignals.boostTokens.join(', ')}</dd>
              </>
            ) : null}

            {brief.styleSignals.penaltyTokens.length > 0 ? (
              <>
                <dt>Search ranks down</dt>
                <dd>{brief.styleSignals.penaltyTokens.join(', ')}</dd>
              </>
            ) : null}

            {/* A style the profile carries that search has no reading of is worth
                saying: it looks like it is doing something and is not. */}
            {brief.styleSignals.unmappedStyles.length > 0 ? (
              <>
                <dt>No search reading for</dt>
                <dd>{brief.styleSignals.unmappedStyles.join(', ')}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  )
}

function seed(brief: ProjectBriefDto): Draft {
  return {
    engine: brief.engines,
    platform: brief.platforms,
    genre: brief.genres,
    style: brief.styles,
    perspective: brief.perspectives,
  }
}
