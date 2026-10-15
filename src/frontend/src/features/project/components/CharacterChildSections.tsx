import './ProjectCharactersSection.css'

import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { type ReactNode, useState } from 'react'

import type {
  CharacterAbilityDto,
  CharacterVariantDto,
  ProjectCharacterDto,
  ProjectCharacterImageDto,
  ProjectCharacterModelDto,
} from '@/features/project/api/projectStudioApi'
import { resolveApiAssetUrl } from '@/lib/apiBase'

export type CharacterChildKind = 'ability' | 'variant' | 'image' | 'model'

export interface CharacterAbilityValues {
  name: string
  description: string
}

export interface CharacterVariantValues extends CharacterAbilityValues {
  projectLevelId: number | null
}

export interface CharacterImageValues {
  title: string
  caption: string
}

export interface CharacterChildPending {
  image: boolean
  model: boolean
  ability: boolean
  variant: boolean
}

/**
 * The four child record kinds share one add/update/remove surface, so the card
 * hands them down as a single object instead of a dozen separate props.
 */
export interface CharacterChildEditor {
  addImage: (file: File) => void
  addModel: (modelId: number) => void
  addAbility: (values: CharacterAbilityValues) => void
  addVariant: (values: CharacterVariantValues) => void
  updateImage: (imageId: number, values: CharacterImageValues) => void
  updateModel: (linkId: number, label: string) => void
  updateAbility: (abilityId: number, values: CharacterAbilityValues) => void
  updateVariant: (variantId: number, values: CharacterVariantValues) => void
  remove: (kind: CharacterChildKind, id: number) => void
  pending: CharacterChildPending
}

const imageLabel = (image: ProjectCharacterImageDto) =>
  image.title || image.fileName || 'image'

const modelLabel = (model: ProjectCharacterModelDto) =>
  model.label || model.modelName || `Model #${model.modelId}`

export function CharacterMedia({
  character,
  models,
  editor,
}: {
  character: ProjectCharacterDto
  models: Array<{ id: string; name: string }>
  editor: CharacterChildEditor
}) {
  const [modelId, setModelId] = useState('')
  const [editingImageId, setEditingImageId] = useState<number | null>(null)
  const [editingModelId, setEditingModelId] = useState<number | null>(null)
  const editingImage =
    character.images.find(image => image.id === editingImageId) ?? null

  return (
    <div className="project-character-editor-section">
      <h5>Media and models</h5>
      <div className="project-character-media-grid">
        {character.images.map(image => (
          <figure key={image.id} className="project-character-media">
            {image.previewUrl ? (
              <img
                src={resolveApiAssetUrl(image.previewUrl) ?? undefined}
                alt={imageLabel(image)}
              />
            ) : (
              <div className="project-character-media-placeholder">
                <i className="pi pi-image" />
              </div>
            )}
            <figcaption>{imageLabel(image)}</figcaption>
            <div className="project-character-media-actions">
              <button
                type="button"
                className="project-character-remove"
                aria-label={`Edit details for ${imageLabel(image)}`}
                title="Edit image details"
                onClick={() => {
                  setEditingModelId(null)
                  setEditingImageId(current =>
                    current === image.id ? null : image.id
                  )
                }}
              >
                <i className="pi pi-pencil" />
              </button>
              <button
                type="button"
                className="project-character-remove"
                aria-label={`Remove image from ${character.name}`}
                title="Remove image"
                onClick={() => editor.remove('image', image.id)}
              >
                <i className="pi pi-times" />
              </button>
            </div>
          </figure>
        ))}
      </div>
      {editingImage ? (
        <ImageEditForm
          key={editingImage.id}
          characterName={character.name}
          image={editingImage}
          pending={editor.pending.image}
          onCancel={() => setEditingImageId(null)}
          onSubmit={values => {
            editor.updateImage(editingImage.id, values)
            setEditingImageId(null)
          }}
        />
      ) : null}
      <label className="project-character-file-button">
        <i className="pi pi-plus" />
        <span>Add image</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) editor.addImage(file)
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
            editor.addModel(Number(modelId))
            setModelId('')
          }}
        />
      </div>
      {character.models.map(model => (
        <CharacterChildRow
          key={model.id}
          testId="project-character-model"
          dataName={modelLabel(model)}
          title={modelLabel(model)}
          editing={editingModelId === model.id}
          editLabel={`Edit label for ${model.modelName ?? `model ${model.id}`}`}
          onEdit={() => {
            setEditingImageId(null)
            setEditingModelId(model.id)
          }}
          onRemove={() => editor.remove('model', model.id)}
        >
          <ModelLabelForm
            key={model.id}
            characterName={character.name}
            model={model}
            pending={editor.pending.model}
            onCancel={() => setEditingModelId(null)}
            onSubmit={label => {
              editor.updateModel(model.id, label)
              setEditingModelId(null)
            }}
          />
        </CharacterChildRow>
      ))}
    </div>
  )
}

export function CharacterAbilities({
  character,
  editor,
}: {
  character: ProjectCharacterDto
  editor: CharacterChildEditor
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

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
          onClick={() => {
            setShowAdd(current => !current)
            setEditingId(null)
          }}
        />
      </div>
      {character.abilities.map(ability => (
        <CharacterChildRow
          key={ability.id}
          testId="project-character-ability"
          dataName={ability.name}
          title={ability.name}
          description={ability.description}
          editing={editingId === ability.id}
          editLabel={`Edit ability ${ability.name}`}
          onEdit={() => {
            setShowAdd(false)
            setEditingId(ability.id)
          }}
          onRemove={() => editor.remove('ability', ability.id)}
        >
          <AbilityEditForm
            key={ability.id}
            characterName={character.name}
            ability={ability}
            pending={editor.pending.ability}
            onCancel={() => setEditingId(null)}
            onSubmit={values => {
              editor.updateAbility(ability.id, values)
              setEditingId(null)
            }}
          />
        </CharacterChildRow>
      ))}
      {showAdd ? (
        <form
          className="project-character-form"
          onSubmit={event => {
            event.preventDefault()
            if (name.trim()) {
              editor.addAbility({
                name: name.trim(),
                description: description.trim(),
              })
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
          <Button
            type="submit"
            label="Save ability"
            aria-label="Save ability"
            disabled={!name.trim()}
          />
        </form>
      ) : null}
    </div>
  )
}

export function CharacterVariants({
  character,
  levels,
  editor,
}: {
  character: ProjectCharacterDto
  levels: Array<{ id: number; name: string }>
  editor: CharacterChildEditor
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [levelId, setLevelId] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

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
          onClick={() => {
            setShowAdd(current => !current)
            setEditingId(null)
          }}
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
          editing={editingId === variant.id}
          editLabel={`Edit variant ${variant.name}`}
          onEdit={() => {
            setShowAdd(false)
            setEditingId(variant.id)
          }}
          onRemove={() => editor.remove('variant', variant.id)}
        >
          <VariantEditForm
            key={variant.id}
            characterName={character.name}
            levels={levels}
            variant={variant}
            pending={editor.pending.variant}
            onCancel={() => setEditingId(null)}
            onSubmit={values => {
              editor.updateVariant(variant.id, values)
              setEditingId(null)
            }}
          />
        </CharacterChildRow>
      ))}
      {showAdd ? (
        <form
          className="project-character-form"
          onSubmit={event => {
            event.preventDefault()
            if (name.trim()) {
              editor.addVariant({
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
          <Button
            type="submit"
            label="Save variant"
            aria-label="Save variant"
            disabled={!name.trim()}
          />
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
  editing,
  editLabel,
  onEdit,
  onRemove,
  children,
}: {
  testId: string
  dataName: string
  title: string
  description?: string | null
  editing: boolean
  editLabel: string
  onEdit: () => void
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <div
      className="project-character-link-row"
      data-testid={testId}
      data-name={dataName}
    >
      {editing ? (
        children
      ) : (
        <>
          <div>
            <strong>{title}</strong>
            {description ? <small>{description}</small> : null}
          </div>
          <div className="project-character-row-actions">
            <button
              type="button"
              className="project-character-remove"
              aria-label={editLabel}
              title="Edit"
              onClick={onEdit}
            >
              <i className="pi pi-pencil" />
            </button>
            <button
              type="button"
              className="project-character-remove"
              aria-label={`Remove ${title}`}
              onClick={onRemove}
            >
              <i className="pi pi-times" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ImageEditForm({
  characterName,
  image,
  pending,
  onCancel,
  onSubmit,
}: {
  characterName: string
  image: ProjectCharacterImageDto
  pending: boolean
  onCancel: () => void
  onSubmit: (values: CharacterImageValues) => void
}) {
  const [title, setTitle] = useState(image.title ?? '')
  const [caption, setCaption] = useState(image.caption ?? '')

  return (
    <form
      className="project-character-form"
      data-testid="project-character-image-edit"
      onSubmit={event => {
        event.preventDefault()
        onSubmit({ title: title.trim(), caption: caption.trim() })
      }}
    >
      <div className="project-character-form-title">
        Edit {imageLabel(image)}
      </div>
      <InputText
        aria-label={`Image title for ${characterName}`}
        value={title}
        onChange={event => setTitle(event.target.value)}
        placeholder="Title"
      />
      <InputTextarea
        aria-label={`Image caption for ${characterName}`}
        value={caption}
        onChange={event => setCaption(event.target.value)}
        rows={2}
        placeholder="Caption"
      />
      <div className="project-character-form-actions">
        <Button
          label="Cancel"
          text
          type="button"
          aria-label="Cancel image edit"
          onClick={onCancel}
        />
        <Button
          type="submit"
          label="Save image details"
          aria-label="Save image details"
          disabled={pending}
        />
      </div>
    </form>
  )
}

function ModelLabelForm({
  characterName,
  model,
  pending,
  onCancel,
  onSubmit,
}: {
  characterName: string
  model: ProjectCharacterModelDto
  pending: boolean
  onCancel: () => void
  onSubmit: (label: string) => void
}) {
  const [label, setLabel] = useState(model.label ?? '')

  return (
    <form
      className="project-character-form"
      data-testid="project-character-model-edit"
      onSubmit={event => {
        event.preventDefault()
        onSubmit(label.trim())
      }}
    >
      <InputText
        aria-label={`Model label for ${characterName}`}
        value={label}
        onChange={event => setLabel(event.target.value)}
        placeholder="Label"
      />
      <div className="project-character-form-actions">
        <Button
          label="Cancel"
          text
          type="button"
          aria-label="Cancel model label edit"
          onClick={onCancel}
        />
        <Button
          type="submit"
          label="Save model label"
          aria-label="Save model label"
          disabled={pending}
        />
      </div>
    </form>
  )
}

function AbilityEditForm({
  characterName,
  ability,
  pending,
  onCancel,
  onSubmit,
}: {
  characterName: string
  ability: CharacterAbilityDto
  pending: boolean
  onCancel: () => void
  onSubmit: (values: CharacterAbilityValues) => void
}) {
  const [name, setName] = useState(ability.name)
  const [description, setDescription] = useState(ability.description ?? '')

  return (
    <form
      className="project-character-form"
      data-testid="project-character-ability-edit"
      onSubmit={event => {
        event.preventDefault()
        if (name.trim()) {
          onSubmit({ name: name.trim(), description: description.trim() })
        }
      }}
    >
      <InputText
        aria-label={`Edit ability name for ${characterName}`}
        value={name}
        onChange={event => setName(event.target.value)}
        placeholder="Ability name"
      />
      <InputText
        aria-label={`Edit ability description for ${characterName}`}
        value={description}
        onChange={event => setDescription(event.target.value)}
        placeholder="What does it do?"
      />
      <div className="project-character-form-actions">
        <Button
          label="Cancel"
          text
          type="button"
          aria-label="Cancel ability edit"
          onClick={onCancel}
        />
        <Button
          type="submit"
          label="Save ability changes"
          aria-label="Save ability changes"
          disabled={!name.trim() || pending}
        />
      </div>
    </form>
  )
}

function VariantEditForm({
  characterName,
  levels,
  variant,
  pending,
  onCancel,
  onSubmit,
}: {
  characterName: string
  levels: Array<{ id: number; name: string }>
  variant: CharacterVariantDto
  pending: boolean
  onCancel: () => void
  onSubmit: (values: CharacterVariantValues) => void
}) {
  const [name, setName] = useState(variant.name)
  const [description, setDescription] = useState(variant.description ?? '')
  const [levelId, setLevelId] = useState(
    variant.projectLevelId != null ? String(variant.projectLevelId) : ''
  )

  return (
    <form
      className="project-character-form"
      data-testid="project-character-variant-edit"
      onSubmit={event => {
        event.preventDefault()
        if (name.trim()) {
          onSubmit({
            name: name.trim(),
            description: description.trim(),
            projectLevelId: levelId ? Number(levelId) : null,
          })
        }
      }}
    >
      <InputText
        aria-label={`Edit variant name for ${characterName}`}
        value={name}
        onChange={event => setName(event.target.value)}
        placeholder="Variant name"
      />
      <InputText
        aria-label={`Edit variant description for ${characterName}`}
        value={description}
        onChange={event => setDescription(event.target.value)}
        placeholder="What changes?"
      />
      <select
        aria-label={`Edit variant level for ${characterName}`}
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
      <div className="project-character-form-actions">
        <Button
          label="Cancel"
          text
          type="button"
          aria-label="Cancel variant edit"
          onClick={onCancel}
        />
        <Button
          type="submit"
          label="Save variant changes"
          aria-label="Save variant changes"
          disabled={!name.trim() || pending}
        />
      </div>
    </form>
  )
}
