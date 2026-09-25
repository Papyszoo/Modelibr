import './ProjectCharactersSection.css'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useState } from 'react'

import { uploadFile } from '@/features/models/api/modelApi'
import { getModelsByProject } from '@/features/project/api/projectApi'
import {
  addCharacterAbility,
  addCharacterVariant,
  addProjectCharacterImage,
  addProjectCharacterModel,
  createProductionNote,
  createProjectCharacter,
  deleteProjectCharacter,
  type ProductionNoteDto,
  type ProjectCharacterDto,
  removeCharacterAbility,
  removeCharacterVariant,
  removeProjectCharacterImage,
  removeProjectCharacterModel,
  updateProjectCharacter,
} from '@/features/project/api/projectStudioApi'
import {
  useProductionNotesQuery,
  useProjectCharactersQuery,
  useProjectLevelsQuery,
} from '@/features/project/api/projectStudioQueries'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/feedback'

interface ProjectCharactersSectionProps {
  projectId: number
  onChanged?: () => void
}

type CharacterSection =
  | 'identity'
  | 'notes'
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
  const notesQuery = useProductionNotesQuery(projectId)
  const modelsQuery = useQuery({
    queryKey: ['projects', projectId, 'character-models'],
    queryFn: () => getModelsByProject(projectId),
  })
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'characters'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'production-notes'],
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

  const createNote = useMutation({
    mutationFn: (input: { characterId: number; title: string; body: string }) =>
      createProductionNote(projectId, {
        characterId: input.characterId,
        title: input.title,
        body: input.body,
        isPinned: false,
      }),
    onSuccess: invalidate,
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

  const removeChild = useMutation({
    mutationFn: (input: {
      characterId: number
      kind: 'ability' | 'variant' | 'image' | 'model'
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

  const queryError =
    charactersQuery.error ?? levelsQuery.error ?? notesQuery.error
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
          void Promise.all([
            charactersQuery.refetch(),
            levelsQuery.refetch(),
            notesQuery.refetch(),
          ])
        }}
      />
    )
  }
  if (charactersQuery.isLoading || notesQuery.isLoading) {
    return <LoadingState message="Loading characters…" />
  }

  const characters = charactersQuery.data ?? []
  const levels = levelsQuery.data ?? []
  const notes = notesQuery.data ?? []
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
          {characters.map(character => (
            <CharacterCard
              key={character.id}
              character={character}
              notes={notes.filter(note => note.characterId === character.id)}
              levels={levels}
              models={models}
              expanded={expandedId === character.id}
              onToggle={() =>
                setExpandedId(current =>
                  current === character.id ? null : character.id
                )
              }
              onUpdate={values =>
                updateCharacter.mutate({ id: character.id, ...values })
              }
              onAddNote={values =>
                createNote.mutate({ characterId: character.id, ...values })
              }
              onAddImage={file =>
                addImage.mutate({ characterId: character.id, file })
              }
              onAddModel={modelId =>
                addModel.mutate({ characterId: character.id, modelId })
              }
              onAddAbility={values =>
                addAbility.mutate({ characterId: character.id, ...values })
              }
              onAddVariant={values =>
                addVariant.mutate({ characterId: character.id, ...values })
              }
              onRemoveChild={(kind, id) =>
                removeChild.mutate({ characterId: character.id, kind, id })
              }
              onDelete={() => {
                confirmDialog({
                  header: 'Delete character',
                  message: `Delete ${character.name} and its production notes, abilities, and variants? Linked files and models stay in the library.`,
                  icon: 'pi pi-exclamation-triangle',
                  acceptLabel: 'Delete',
                  rejectLabel: 'Cancel',
                  acceptClassName: 'p-button-danger',
                  accept: () => deleteCharacter.mutate(character.id),
                })
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CharacterCard({
  character,
  notes,
  levels,
  models,
  expanded,
  onToggle,
  onUpdate,
  onAddNote,
  onAddImage,
  onAddModel,
  onAddAbility,
  onAddVariant,
  onRemoveChild,
  onDelete,
}: {
  character: ProjectCharacterDto
  notes: ProductionNoteDto[]
  levels: Array<{ id: number; name: string }>
  models: Array<{ id: string; name: string }>
  expanded: boolean
  onToggle: () => void
  onUpdate: (values: {
    name: string
    description: string
    tags: string[]
  }) => void
  onAddNote: (values: { title: string; body: string }) => void
  onAddImage: (file: File) => void
  onAddModel: (modelId: number) => void
  onAddAbility: (values: { name: string; description: string }) => void
  onAddVariant: (values: {
    name: string
    description: string
    projectLevelId: number | null
  }) => void
  onRemoveChild: (
    kind: 'ability' | 'variant' | 'image' | 'model',
    id: number
  ) => void
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
                  ['notes', isEnemy ? 'Enemy notes' : 'Notes'],
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
          {section === 'notes' ? (
            <CharacterNotes
              character={character}
              notes={notes}
              isEnemy={isEnemy}
              onAdd={onAddNote}
            />
          ) : null}
          {section === 'media' ? (
            <CharacterMedia
              character={character}
              models={models}
              onAddImage={onAddImage}
              onAddModel={onAddModel}
              onRemove={onRemoveChild}
            />
          ) : null}
          {section === 'abilities' ? (
            <CharacterAbilities
              character={character}
              onAdd={onAddAbility}
              onRemove={onRemoveChild}
            />
          ) : null}
          {section === 'variants' ? (
            <CharacterVariants
              character={character}
              levels={levels}
              onAdd={onAddVariant}
              onRemove={onRemoveChild}
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

function CharacterNotes({
  character,
  notes,
  isEnemy,
  onAdd,
}: {
  character: ProjectCharacterDto
  notes: ProductionNoteDto[]
  isEnemy: boolean
  onAdd: (values: { title: string; body: string }) => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="project-character-editor-section">
      <div className="project-character-section-header">
        <h5>{isEnemy ? 'Enemy notes and weaknesses' : 'Character notes'}</h5>
        <Button
          icon="pi pi-plus"
          text
          rounded
          aria-label={`Add note to ${character.name}`}
          title="Add note"
          onClick={() => setShowAdd(current => !current)}
        />
      </div>
      {notes.map(note => (
        <div
          className="project-character-note"
          key={note.id}
          data-testid="project-character-note"
        >
          <strong>{note.title}</strong>
          <p>{note.body}</p>
        </div>
      ))}
      {showAdd ? (
        <form
          className="project-character-form"
          onSubmit={event => {
            event.preventDefault()
            if (title.trim() && body.trim()) {
              onAdd({ title: title.trim(), body: body.trim() })
              setTitle('')
              setBody('')
              setShowAdd(false)
            }
          }}
        >
          <InputText
            aria-label={`Note title for ${character.name}`}
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder={isEnemy ? 'Weakness' : 'Note title'}
          />
          <InputTextarea
            aria-label={`Note body for ${character.name}`}
            value={body}
            onChange={event => setBody(event.target.value)}
            rows={2}
            placeholder={
              isEnemy ? 'What should the player know?' : 'Production context'
            }
          />
          <Button
            type="submit"
            label="Add note"
            disabled={!title.trim() || !body.trim()}
          />
        </form>
      ) : null}
    </div>
  )
}

function CharacterMedia({
  character,
  models,
  onAddImage,
  onAddModel,
  onRemove,
}: {
  character: ProjectCharacterDto
  models: Array<{ id: string; name: string }>
  onAddImage: (file: File) => void
  onAddModel: (modelId: number) => void
  onRemove: (
    kind: 'ability' | 'variant' | 'image' | 'model',
    id: number
  ) => void
}) {
  const [modelId, setModelId] = useState('')

  return (
    <div className="project-character-editor-section">
      <h5>Media and models</h5>
      <div className="project-character-media-grid">
        {character.images.map(image => (
          <figure key={image.id} className="project-character-media">
            {image.previewUrl ? (
              <img
                src={resolveApiAssetUrl(image.previewUrl)}
                alt={image.title ?? image.fileName ?? 'Character image'}
              />
            ) : (
              <div className="project-character-media-placeholder">
                <i className="pi pi-image" />
              </div>
            )}
            <figcaption>{image.title || image.fileName || 'Image'}</figcaption>
            <button
              type="button"
              className="project-character-remove"
              aria-label={`Remove image from ${character.name}`}
              onClick={() => onRemove('image', image.id)}
            >
              <i className="pi pi-times" />
            </button>
          </figure>
        ))}
      </div>
      <label className="project-character-file-button">
        <i className="pi pi-plus" />
        <span>Add image</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) onAddImage(file)
            event.target.value = ''
          }}
        />
      </label>
      <div className="project-character-inline-form">
        <select
          aria-label={`Link a model to ${character.name}`}
          value={modelId}
          onChange={event => setModelId(event.target.value)}
        >
          <option value="">Link a model…</option>
          {models.map(model => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        <Button
          icon="pi pi-plus"
          aria-label="Link model"
          disabled={!modelId}
          onClick={() => {
            onAddModel(Number(modelId))
            setModelId('')
          }}
        />
      </div>
      {character.models.map(model => (
        <div className="project-character-link-row" key={model.id}>
          <span>
            {model.label || model.modelName || `Model #${model.modelId}`}
          </span>
          <button
            type="button"
            className="project-character-remove"
            aria-label={`Remove ${model.modelName ?? 'model'} from ${character.name}`}
            onClick={() => onRemove('model', model.id)}
          >
            <i className="pi pi-times" />
          </button>
        </div>
      ))}
    </div>
  )
}

function CharacterAbilities({
  character,
  onAdd,
  onRemove,
}: {
  character: ProjectCharacterDto
  onAdd: (values: { name: string; description: string }) => void
  onRemove: (
    kind: 'ability' | 'variant' | 'image' | 'model',
    id: number
  ) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  return (
    <div className="project-character-editor-section">
      <div className="project-character-section-header">
        <h5>Abilities</h5>
        <Button
          icon="pi pi-plus"
          text
          rounded
          aria-label={`Add ability to ${character.name}`}
          title="Add ability"
          onClick={() => setShowAdd(current => !current)}
        />
      </div>
      {character.abilities.map(ability => (
        <CharacterChildRow
          key={ability.id}
          testId="project-character-ability"
          dataName={ability.name}
          title={ability.name}
          description={ability.description}
          onRemove={() => onRemove('ability', ability.id)}
        />
      ))}
      {showAdd ? (
        <form
          className="project-character-form"
          onSubmit={event => {
            event.preventDefault()
            if (name.trim()) {
              onAdd({ name: name.trim(), description: description.trim() })
              setName('')
              setDescription('')
              setShowAdd(false)
            }
          }}
        >
          <InputText
            aria-label={`New ability for ${character.name}`}
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Ability name"
          />
          <InputText
            aria-label={`Ability description for ${character.name}`}
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="What does it do?"
          />
          <Button type="submit" label="Add ability" disabled={!name.trim()} />
        </form>
      ) : null}
    </div>
  )
}

function CharacterVariants({
  character,
  levels,
  onAdd,
  onRemove,
}: {
  character: ProjectCharacterDto
  levels: Array<{ id: number; name: string }>
  onAdd: (values: {
    name: string
    description: string
    projectLevelId: number | null
  }) => void
  onRemove: (
    kind: 'ability' | 'variant' | 'image' | 'model',
    id: number
  ) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [levelId, setLevelId] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  return (
    <div className="project-character-editor-section">
      <div className="project-character-section-header">
        <h5>Variants</h5>
        <Button
          icon="pi pi-plus"
          text
          rounded
          aria-label={`Add variant to ${character.name}`}
          title="Add variant"
          onClick={() => setShowAdd(current => !current)}
        />
      </div>
      {character.variants.map(variant => (
        <CharacterChildRow
          key={variant.id}
          testId="project-character-variant"
          dataName={variant.name}
          title={variant.name}
          description={[variant.projectLevelName, variant.description]
            .filter(Boolean)
            .join(' · ')}
          onRemove={() => onRemove('variant', variant.id)}
        />
      ))}
      {showAdd ? (
        <form
          className="project-character-form"
          onSubmit={event => {
            event.preventDefault()
            if (name.trim()) {
              onAdd({
                name: name.trim(),
                description: description.trim(),
                projectLevelId: levelId ? Number(levelId) : null,
              })
              setName('')
              setDescription('')
              setLevelId('')
              setShowAdd(false)
            }
          }}
        >
          <InputText
            aria-label={`New variant for ${character.name}`}
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Variant name"
          />
          <InputText
            aria-label={`Variant description for ${character.name}`}
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="What changes?"
          />
          <select
            aria-label={`Variant level for ${character.name}`}
            value={levelId}
            onChange={event => setLevelId(event.target.value)}
          >
            <option value="">Any level</option>
            {levels.map(level => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
          <Button type="submit" label="Add variant" disabled={!name.trim()} />
        </form>
      ) : null}
    </div>
  )
}

function CharacterChildRow({
  testId,
  dataName,
  title,
  description,
  onRemove,
}: {
  testId: string
  dataName: string
  title: string
  description?: string | null
  onRemove: () => void
}) {
  return (
    <div
      className="project-character-link-row"
      data-testid={testId}
      data-name={dataName}
    >
      <div>
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      <button
        type="button"
        className="project-character-remove"
        aria-label={`Remove ${title}`}
        onClick={onRemove}
      >
        <i className="pi pi-times" />
      </button>
    </div>
  )
}
