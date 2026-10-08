import './ProjectCharactersSection.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useState } from 'react'

import { uploadFile } from '@/features/models/api/modelApi'
import {
  addCharacterAbility,
  addCharacterVariant,
  addProjectCharacterImage,
  addProjectCharacterModel,
  createProjectCharacter,
  deleteProjectCharacter,
  type ProjectCharacterDto,
  removeCharacterAbility,
  removeCharacterVariant,
  removeProjectCharacterImage,
  removeProjectCharacterModel,
  updateCharacterAbility,
  updateCharacterVariant,
  updateProjectCharacter,
  updateProjectCharacterImage,
  updateProjectCharacterModel,
} from '@/features/project/api/projectStudioApi'
import {
  useProjectCharactersQuery,
  useProjectLevelsQuery,
  useProjectMemberModelsQuery,
} from '@/features/project/api/projectStudioQueries'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/feedback'

import {
  CharacterAbilities,
  type CharacterChildEditor,
  type CharacterChildKind,
  CharacterMedia,
  CharacterVariants,
} from './CharacterChildSections'
import { ProjectCommentsBadge } from './ProjectCommentsBadge'
import { ProjectCommentThread } from './ProjectCommentThread'

interface ProjectCharactersSectionProps {
  projectId: number
  onChanged?: () => void
}

type CharacterSection =
  | 'identity'
  | 'comments'
  | 'media'
  | 'abilities'
  | 'variants'

export function ProjectCharactersSection({
  projectId,
  onChanged,
}: ProjectCharactersSectionProps) {
  const queryClient = useQueryClient()
  const charactersQuery = useProjectCharactersQuery(projectId)
  const levelsQuery = useProjectLevelsQuery(projectId)
  const modelsQuery = useProjectMemberModelsQuery(projectId)
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'characters'],
      }),
      onChanged?.(),
    ])
  }

  const createCharacter = useMutation({
    mutationFn: (input: {
      name: string
      description: string
      tags: string[]
    }) => createProjectCharacter(projectId, input),
    onSuccess: async character => {
      setShowCreate(false)
      setExpandedId(character.id)
      await invalidate()
    },
  })

  const updateCharacter = useMutation({
    mutationFn: (input: {
      id: number
      name: string
      description: string
      tags: string[]
    }) =>
      updateProjectCharacter(projectId, input.id, {
        name: input.name,
        description: input.description,
        tags: input.tags,
      }),
    onSuccess: invalidate,
  })

  const deleteCharacter = useMutation({
    mutationFn: (characterId: number) =>
      deleteProjectCharacter(projectId, characterId),
    onSuccess: async () => {
      setExpandedId(null)
      await invalidate()
    },
  })

  const addImage = useMutation({
    mutationFn: async (input: { characterId: number; file: File }) => {
      const uploaded = await uploadFile(input.file, { uploadType: 'file' })
      return addProjectCharacterImage(projectId, input.characterId, {
        fileId: uploaded.fileId,
      })
    },
    onSuccess: invalidate,
  })

  const addModel = useMutation({
    mutationFn: (input: { characterId: number; modelId: number }) =>
      addProjectCharacterModel(projectId, input.characterId, {
        modelId: input.modelId,
      }),
    onSuccess: invalidate,
  })

  const addAbility = useMutation({
    mutationFn: (input: {
      characterId: number
      name: string
      description: string
    }) =>
      addCharacterAbility(projectId, input.characterId, {
        name: input.name,
        description: input.description,
      }),
    onSuccess: invalidate,
  })

  const addVariant = useMutation({
    mutationFn: (input: {
      characterId: number
      name: string
      description: string
      projectLevelId: number | null
    }) =>
      addCharacterVariant(projectId, input.characterId, {
        name: input.name,
        description: input.description,
        projectLevelId: input.projectLevelId,
      }),
    onSuccess: invalidate,
  })

  const updateImage = useMutation({
    mutationFn: (input: {
      characterId: number
      imageId: number
      title: string
      caption: string
    }) =>
      updateProjectCharacterImage(projectId, input.characterId, input.imageId, {
        title: input.title,
        caption: input.caption,
      }),
    onSuccess: invalidate,
  })

  const updateModel = useMutation({
    mutationFn: (input: {
      characterId: number
      linkId: number
      label: string
    }) =>
      updateProjectCharacterModel(projectId, input.characterId, input.linkId, {
        label: input.label,
      }),
    onSuccess: invalidate,
  })

  const updateAbility = useMutation({
    mutationFn: (input: {
      characterId: number
      abilityId: number
      name: string
      description: string
    }) =>
      updateCharacterAbility(projectId, input.characterId, input.abilityId, {
        name: input.name,
        description: input.description,
      }),
    onSuccess: invalidate,
  })

  const updateVariant = useMutation({
    mutationFn: (input: {
      characterId: number
      variantId: number
      name: string
      description: string
      projectLevelId: number | null
    }) =>
      updateCharacterVariant(projectId, input.characterId, input.variantId, {
        name: input.name,
        description: input.description,
        projectLevelId: input.projectLevelId,
      }),
    onSuccess: invalidate,
  })

  const removeChild = useMutation({
    mutationFn: (input: {
      characterId: number
      kind: CharacterChildKind
      id: number
    }) => {
      if (input.kind === 'ability') {
        return removeCharacterAbility(projectId, input.characterId, input.id)
      }
      if (input.kind === 'variant') {
        return removeCharacterVariant(projectId, input.characterId, input.id)
      }
      if (input.kind === 'image') {
        return removeProjectCharacterImage(
          projectId,
          input.characterId,
          input.id
        )
      }
      return removeProjectCharacterModel(projectId, input.characterId, input.id)
    },
    onSuccess: invalidate,
  })

  const queryError = charactersQuery.error ?? levelsQuery.error
  if (queryError) {
    return (
      <ErrorState
        title="Could not load characters"
        message={
          queryError instanceof Error
            ? queryError.message
            : 'The character request failed.'
        }
        onRetry={() => {
          void Promise.all([charactersQuery.refetch(), levelsQuery.refetch()])
        }}
      />
    )
  }
  if (charactersQuery.isLoading) {
    return <LoadingState message="Loading characters…" />
  }

  const characters = charactersQuery.data ?? []
  const levels = levelsQuery.data ?? []
  const models = modelsQuery.data ?? []

  return (
    <section
      className="project-characters-section"
      data-testid="project-characters"
    >
      <div className="project-characters-header">
        <div>
          <span className="container-rich-kicker">Production cast</span>
          <h3>Characters</h3>
        </div>
        <div className="project-characters-header-actions">
          <span className="project-studio-count">{characters.length}</span>
          <Button
            icon="pi pi-plus"
            text
            rounded
            aria-label="Add character"
            title="Add character"
            onClick={() => setShowCreate(current => !current)}
          />
        </div>
      </div>

      {showCreate ? (
        <CharacterForm
          title="New character"
          submitLabel="Create character"
          pending={createCharacter.isPending}
          onCancel={() => setShowCreate(false)}
          onSubmit={values => createCharacter.mutate(values)}
        />
      ) : null}

      {characters.length === 0 ? (
        <EmptyState
          icon="pi pi-users"
          title="No characters yet"
          message="Add a character when the project has a player, enemy, NPC, or other production entity."
        />
      ) : (
        <div className="project-character-grid">
          {characters.map(character => {
            const childEditor: CharacterChildEditor = {
              addImage: file =>
                addImage.mutate({ characterId: character.id, file }),
              addModel: modelId =>
                addModel.mutate({ characterId: character.id, modelId }),
              addAbility: values =>
                addAbility.mutate({ characterId: character.id, ...values }),
              addVariant: values =>
                addVariant.mutate({ characterId: character.id, ...values }),
              updateImage: (imageId, values) =>
                updateImage.mutate({
                  characterId: character.id,
                  imageId,
                  ...values,
                }),
              updateModel: (linkId, label) =>
                updateModel.mutate({
                  characterId: character.id,
                  linkId,
                  label,
                }),
              updateAbility: (abilityId, values) =>
                updateAbility.mutate({
                  characterId: character.id,
                  abilityId,
                  ...values,
                }),
              updateVariant: (variantId, values) =>
                updateVariant.mutate({
                  characterId: character.id,
                  variantId,
                  ...values,
                }),
              remove: (kind, id) =>
                removeChild.mutate({ characterId: character.id, kind, id }),
              pending: {
                image: addImage.isPending || updateImage.isPending,
                model: addModel.isPending || updateModel.isPending,
                ability: addAbility.isPending || updateAbility.isPending,
                variant: addVariant.isPending || updateVariant.isPending,
              },
            }
            return (
              <CharacterCard
                key={character.id}
                character={character}
                projectId={projectId}
                levels={levels}
                models={models}
                childEditor={childEditor}
                expanded={expandedId === character.id}
                onToggle={() =>
                  setExpandedId(current =>
                    current === character.id ? null : character.id
                  )
                }
                onUpdate={values =>
                  updateCharacter.mutate({ id: character.id, ...values })
                }
                onDelete={() => {
                  confirmDialog({
                    header: 'Delete character',
                    message: `Delete ${character.name} and its abilities and variants? Its comments move to the project, and linked files and models stay in the library.`,
                    icon: 'pi pi-exclamation-triangle',
                    acceptLabel: 'Delete',
                    rejectLabel: 'Cancel',
                    acceptClassName: 'p-button-danger',
                    accept: () => deleteCharacter.mutate(character.id),
                  })
                }}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}

function CharacterCard({
  character,
  projectId,
  levels,
  models,
  childEditor,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  character: ProjectCharacterDto
  projectId: number
  levels: Array<{ id: number; name: string }>
  models: Array<{ id: string; name: string }>
  childEditor: CharacterChildEditor
  expanded: boolean
  onToggle: () => void
  onUpdate: (values: {
    name: string
    description: string
    tags: string[]
  }) => void
  onDelete: () => void
}) {
  const isEnemy = character.tags.some(tag => tag.toLowerCase() === 'enemy')
  const [section, setSection] = useState<CharacterSection>('identity')

  return (
    <article
      className={`project-character-card${expanded ? ' is-expanded' : ''}`}
      data-testid="project-character-card"
      data-character-name={character.name}
    >
      <div className="project-character-card-header">
        <div>
          <h4>{character.name}</h4>
          <div className="project-character-tags">
            {character.tags.length === 0 ? (
              <span className="project-character-muted">Untagged</span>
            ) : (
              character.tags.map(tag => (
                <span
                  key={tag}
                  className="project-character-tag"
                  data-testid="project-character-tag"
                >
                  {tag}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="project-character-card-actions">
          <ProjectCommentsBadge
            projectId={projectId}
            target={{ kind: 'characterId', id: character.id }}
            targetName={character.name}
            variant="inline"
          />
          <Button
            icon={expanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'}
            text
            rounded
            aria-label={
              expanded ? `Close ${character.name}` : `Edit ${character.name}`
            }
            title={expanded ? 'Close character' : 'Edit character'}
            onClick={onToggle}
          />
        </div>
      </div>
      {character.description ? (
        <p className="project-character-description">{character.description}</p>
      ) : null}
      <div className="project-character-counts">
        <span>{character.imageCount} images</span>
        <span>{character.modelCount} models</span>
        <span>{character.abilityCount} abilities</span>
        <span>{character.variantCount} variants</span>
      </div>
      {expanded ? (
        <div className="project-character-editor">
          <div className="project-character-editor-bar">
            <div className="project-character-sections" role="tablist">
              {(
                [
                  ['identity', 'Identity'],
                  ['comments', 'Comments'],
                  ['media', 'Media'],
                  ['abilities', 'Abilities'],
                  ['variants', 'Variants'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={section === value}
                  data-testid="project-character-section-tab"
                  data-section={value}
                  className={
                    section === value
                      ? 'project-character-section-tab is-active'
                      : 'project-character-section-tab'
                  }
                  onClick={() => setSection(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              aria-label={`Delete ${character.name}`}
              title="Delete character"
              onClick={onDelete}
            />
          </div>
          {section === 'identity' ? (
            <CharacterForm
              title="Identity"
              submitLabel="Save character"
              initialName={character.name}
              initialDescription={character.description ?? ''}
              initialTags={character.tags.join(', ')}
              onSubmit={onUpdate}
            />
          ) : null}
          {section === 'comments' ? (
            <div className="project-character-editor-section">
              <ProjectCommentThread
                projectId={projectId}
                target={{ kind: 'characterId', id: character.id }}
                targetName={character.name}
                heading={isEnemy ? 'Enemy weaknesses and comments' : 'Comments'}
                itemTestId="project-character-comment"
                titlePlaceholder={isEnemy ? 'Weakness' : 'Comment title'}
                bodyPlaceholder={
                  isEnemy
                    ? 'What should the player know?'
                    : 'What should change, or what was decided?'
                }
              />
            </div>
          ) : null}
          {section === 'media' ? (
            <CharacterMedia
              character={character}
              models={models}
              editor={childEditor}
            />
          ) : null}
          {section === 'abilities' ? (
            <CharacterAbilities character={character} editor={childEditor} />
          ) : null}
          {section === 'variants' ? (
            <CharacterVariants
              character={character}
              levels={levels}
              editor={childEditor}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function CharacterForm({
  title,
  submitLabel,
  initialName = '',
  initialDescription = '',
  initialTags = '',
  pending,
  onSubmit,
  onCancel,
}: {
  title: string
  submitLabel: string
  initialName?: string
  initialDescription?: string
  initialTags?: string
  pending?: boolean
  onSubmit: (values: {
    name: string
    description: string
    tags: string[]
  }) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [tags, setTags] = useState(initialTags)

  return (
    <form
      className="project-character-form"
      onSubmit={event => {
        event.preventDefault()
        if (name.trim()) {
          onSubmit({
            name: name.trim(),
            description: description.trim(),
            tags: [
              ...new Set(
                tags
                  .split(',')
                  .map(tag => tag.trim())
                  .filter(Boolean)
                  .map(tag => tag.toLowerCase())
              ),
            ],
          })
        }
      }}
    >
      <div className="project-character-form-title">{title}</div>
      <InputText
        aria-label="Character name"
        value={name}
        onChange={event => setName(event.target.value)}
        placeholder="Ashen Warden"
      />
      <InputTextarea
        aria-label="Character description"
        value={description}
        onChange={event => setDescription(event.target.value)}
        rows={2}
        placeholder="Who or what is this?"
      />
      <InputText
        aria-label="Character tags"
        value={tags}
        onChange={event => setTags(event.target.value)}
        placeholder="enemy, boss"
      />
      <div className="project-character-form-actions">
        {onCancel ? (
          <Button label="Cancel" text onClick={onCancel} type="button" />
        ) : null}
        <Button
          type="submit"
          label={submitLabel}
          disabled={!name.trim() || pending}
        />
      </div>
    </form>
  )
}
