import './ScriptEditor.css'

import { useQuery } from '@tanstack/react-query'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import CodeMirror from '@uiw/react-codemirror'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Splitter, SplitterPanel } from 'primereact/splitter'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { getModelById, getModels } from '@/features/models/api/modelApi'
import {
  getScriptContent,
  updateScript,
  updateScriptContent,
} from '@/features/scripts/api/scriptApi'
import { useScriptPreviewStore } from '@/stores/scriptPreviewStore'
import { type ScriptDto } from '@/types'

import {
  getLanguageExtension,
  getLanguageLabel,
  getPreviewKind,
} from '../utils/languages'
import { resolveModelPreview } from '../utils/resolveModelPreview'
import { ScriptPreview } from './ScriptPreview'
import { ScriptViewerMenubar } from './ScriptViewerMenubar'

// three/webgpu is heavy, so the scene preview loads only when actually shown.
const ScriptScenePreview = lazy(() =>
  import('./ScriptScenePreview').then(m => ({ default: m.ScriptScenePreview }))
)

interface ScriptEditorProps {
  script: ScriptDto
  onScriptUpdated?: (
    scriptId: number,
    patch: { name?: string; description?: string | null }
  ) => void
}

export function ScriptEditor({ script, onScriptUpdated }: ScriptEditorProps) {
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(script.name)
  const [isSavingName, setIsSavingName] = useState(false)

  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState(
    script.description ?? ''
  )
  const [description, setDescription] = useState(script.description ?? '')
  const [isSavingDescription, setIsSavingDescription] = useState(false)

  const previewKind = getPreviewKind(script.language)
  // Shader previews are cheap + safe, so default them on; scene previews run JS,
  // so they stay opt-in (the toggle is still offered).
  const [showPreview, setShowPreview] = useState(previewKind === 'shader')

  // Scene previews execute user JS, so they run only from an explicit snapshot
  // (Run button / first reveal) — never on keystroke. Shader previews stay live.
  const [runSource, setRunSource] = useState('')

  // panelPosition drives the body layout; the toggle itself lives in the
  // preview header (PreviewLayoutToggle reads/writes the store directly).
  const { panelPosition, geometry, setGeometry, modelId, setModelId } =
    useScriptPreviewStore()

  // Library models for the "apply material to my model" picker.
  const { data: pickerModels } = useQuery({
    queryKey: ['models', 'script-preview-picker'],
    queryFn: () => getModels({}),
    staleTime: 60_000,
  })
  const modelOptions = useMemo(
    () => (pickerModels ?? []).map(m => ({ id: m.id, name: m.name })),
    [pickerModels]
  )

  // The list response doesn't carry per-file detail, so fetch the selected
  // model to find its renderable file (the one the 3D viewer would load).
  const { data: selectedModel } = useQuery({
    queryKey: ['models', 'detail', modelId],
    queryFn: () => getModelById(String(modelId)),
    enabled: modelId != null,
  })
  const modelPreview = useMemo(
    () => (modelId == null ? null : resolveModelPreview(selectedModel)),
    [modelId, selectedModel]
  )

  // Avoids marking the editor dirty for the programmatic onChange that fires
  // when we first push loaded content into CodeMirror.
  const hydratingRef = useRef(false)

  const languageExtensions = useMemo(
    () => getLanguageExtension(script.language),
    [script.language]
  )

  const isDirty = content !== savedContent

  // Reset drafts only when switching to a different script. Keying on the
  // name/description values too would discard an in-progress edit whenever a
  // background refetch pushes a new (even unchanged) script object.
  useEffect(() => {
    setNameDraft(script.name)
    setIsEditingName(false)
    setDescription(script.description ?? '')
    setDescriptionDraft(script.description ?? '')
    setIsEditingDescription(false)
    setRunSource('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script.id])

  useEffect(() => {
    setShowPreview(getPreviewKind(script.language) === 'shader')
  }, [script.id, script.language])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    getScriptContent(script.id)
      .then(text => {
        if (cancelled) return
        hydratingRef.current = true
        setContent(text)
        setSavedContent(text)
      })
      .catch(err => {
        if (cancelled) return
        console.error('Failed to load script content:', err)
        setError('Failed to load script content')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [script.id])

  const handleChange = useCallback((value: string) => {
    if (hydratingRef.current) {
      hydratingRef.current = false
      return
    }
    setContent(value)
  }, [])

  // Snapshot the current source into the scene preview (explicit Run).
  const handleRun = useCallback(() => {
    setRunSource(content)
  }, [content])

  const handleTogglePreview = () => {
    const next = !showPreview
    setShowPreview(next)
    // First reveal of a scene preview gets an initial run so it isn't blank.
    if (next && previewKind === 'scene' && !runSource.trim()) {
      setRunSource(content)
    }
  }

  const handleSave = async () => {
    if (!isDirty || isSaving) return
    try {
      setIsSaving(true)
      await updateScriptContent(script.id, content)
      setSavedContent(content)
    } catch (err) {
      console.error('Failed to save script content:', err)
      setError('Failed to save script content')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveName = async () => {
    const trimmedName = nameDraft.trim()
    if (!trimmedName || trimmedName === script.name) {
      setIsEditingName(false)
      setNameDraft(script.name)
      return
    }

    try {
      setIsSavingName(true)
      // categoryId is authoritative on the backend (omitting it clears the
      // category), so always send the current one when editing other metadata.
      const updated = await updateScript(script.id, {
        name: trimmedName,
        categoryId: script.categoryId,
      })
      setNameDraft(updated.name)
      onScriptUpdated?.(script.id, { name: updated.name })
      setIsEditingName(false)
    } catch (err) {
      console.error('Failed to update script name:', err)
      setNameDraft(script.name)
      setIsEditingName(false)
    } finally {
      setIsSavingName(false)
    }
  }

  const handleSaveDescription = async () => {
    const trimmed = descriptionDraft.trim()
    if (trimmed === (description ?? '').trim()) {
      setIsEditingDescription(false)
      return
    }
    try {
      setIsSavingDescription(true)
      const updated = await updateScript(script.id, {
        description: trimmed,
        categoryId: script.categoryId,
      })
      setDescription(updated.description ?? '')
      setDescriptionDraft(updated.description ?? '')
      onScriptUpdated?.(script.id, { description: updated.description })
      setIsEditingDescription(false)
    } catch (err) {
      console.error('Failed to update script description:', err)
      setDescriptionDraft(description)
      setIsEditingDescription(false)
    } finally {
      setIsSavingDescription(false)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = script.fileName || `${script.name}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const codeEditor = (
    <div className="script-editor-code">
      <CodeMirror
        value={content}
        theme={vscodeDark}
        height="100%"
        style={{ height: '100%' }}
        extensions={languageExtensions}
        onChange={handleChange}
        data-testid="script-codemirror"
      />
    </div>
  )

  const previewPane =
    previewKind === 'scene' ? (
      <Suspense
        fallback={
          <div className="script-editor-loading">
            <i className="pi pi-spin pi-spinner" /> Loading preview…
          </div>
        }
      >
        <ScriptScenePreview
          source={runSource}
          geometry={geometry}
          modelUrl={modelPreview?.url}
          modelExtension={modelPreview?.extension}
          onRun={handleRun}
        />
      </Suspense>
    ) : (
      <ScriptPreview language={script.language} content={content} />
    )

  return (
    <div
      className="script-editor script-editor-page"
      data-testid="script-editor"
    >
      <div className="script-editor-header">
        <div className="script-editor-title">
          {isEditingName ? (
            <InputText
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') {
                  setNameDraft(script.name)
                  setIsEditingName(false)
                }
              }}
              autoFocus
              className="script-title-input"
              data-testid="script-name-input"
            />
          ) : (
            <h2 data-testid="script-name-display">{script.name}</h2>
          )}
          <span className="script-editor-language">
            {getLanguageLabel(script.language)}
          </span>
          {script.categoryName && (
            <span className="script-editor-category">
              <i className="pi pi-folder" /> {script.categoryName}
            </span>
          )}
          {isEditingName ? (
            <div className="script-title-actions">
              <Button
                icon="pi pi-check"
                className="p-button-text p-button-rounded"
                onClick={handleSaveName}
                disabled={isSavingName}
                tooltip="Save name"
                data-testid="script-name-save"
              />
              <Button
                icon="pi pi-times"
                className="p-button-text p-button-rounded"
                onClick={() => {
                  setNameDraft(script.name)
                  setIsEditingName(false)
                }}
                disabled={isSavingName}
                tooltip="Cancel"
                data-testid="script-name-cancel"
              />
            </div>
          ) : (
            <Button
              icon="pi pi-pencil"
              className="p-button-text p-button-rounded"
              onClick={() => setIsEditingName(true)}
              tooltip="Edit name"
              data-testid="script-name-edit"
            />
          )}

          <div
            className="script-editor-desc-inline"
            data-testid="script-description"
          >
            {isEditingDescription ? (
              <>
                <InputText
                  value={descriptionDraft}
                  onChange={e => setDescriptionDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveDescription()
                    if (e.key === 'Escape') {
                      setDescriptionDraft(description)
                      setIsEditingDescription(false)
                    }
                  }}
                  autoFocus
                  placeholder="Describe what this script does…"
                  className="script-desc-input"
                  data-testid="script-description-input"
                />
                <Button
                  icon="pi pi-check"
                  className="p-button-text p-button-rounded"
                  onClick={handleSaveDescription}
                  disabled={isSavingDescription}
                  tooltip="Save description"
                  data-testid="script-description-save"
                />
                <Button
                  icon="pi pi-times"
                  className="p-button-text p-button-rounded"
                  onClick={() => {
                    setDescriptionDraft(description)
                    setIsEditingDescription(false)
                  }}
                  disabled={isSavingDescription}
                  tooltip="Cancel"
                />
              </>
            ) : (
              <button
                type="button"
                className="script-description-display"
                onClick={() => setIsEditingDescription(true)}
                title="Edit description"
              >
                {description ? (
                  <span>{description}</span>
                ) : (
                  <span className="script-description-empty">
                    <i className="pi pi-pencil" /> Add a description…
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <ScriptViewerMenubar
        previewKind={previewKind}
        showPreview={showPreview}
        onTogglePreview={handleTogglePreview}
        geometry={geometry}
        onGeometryChange={setGeometry}
        modelId={modelId}
        models={modelOptions}
        onModelChange={setModelId}
        onDownload={handleDownload}
        downloadDisabled={isLoading}
        onSave={handleSave}
        saveDisabled={!isDirty || isSaving || isLoading}
        isSaving={isSaving}
      />

      {error && <div className="script-editor-error">{error}</div>}

      <div className="script-editor-body">
        {isLoading ? (
          <div className="script-editor-loading">
            <i className="pi pi-spin pi-spinner" />
            <span>Loading source...</span>
          </div>
        ) : showPreview ? (
          <Splitter
            className="script-editor-splitter"
            layout={panelPosition === 'bottom' ? 'vertical' : 'horizontal'}
            // Persist the split per layout so each remembers its own ratio.
            stateKey={`modelibr-script-split-${panelPosition}`}
            stateStorage="local"
          >
            <SplitterPanel
              size={55}
              minSize={20}
              className="script-editor-pane"
            >
              {codeEditor}
            </SplitterPanel>
            <SplitterPanel
              size={45}
              minSize={15}
              className="script-editor-pane"
            >
              <div className="script-editor-preview">{previewPane}</div>
            </SplitterPanel>
          </Splitter>
        ) : (
          codeEditor
        )}
      </div>

      <div className="script-editor-statusbar">
        <span className="script-editor-status">
          {isDirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <span className="script-editor-metrics">
          {script.lineCount} lines · {getLanguageLabel(script.language)}
        </span>
      </div>
    </div>
  )
}
