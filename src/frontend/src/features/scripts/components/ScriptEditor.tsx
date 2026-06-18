import './ScriptEditor.css'

import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import CodeMirror from '@uiw/react-codemirror'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  getScriptContent,
  updateScript,
  updateScriptContent,
} from '@/features/scripts/api/scriptApi'
import { type ScriptDto } from '@/types'

import {
  getLanguageExtension,
  getLanguageLabel,
  getPreviewKind,
  isPreviewableLanguage,
} from '../utils/languages'
import { ScriptPreview } from './ScriptPreview'

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

  const previewable = isPreviewableLanguage(script.language)
  const previewKind = getPreviewKind(script.language)
  // Shader previews are cheap + safe, so default them on; scene previews run JS,
  // so they stay opt-in (the toggle is still offered).
  const [showPreview, setShowPreview] = useState(previewKind === 'shader')

  // Avoids marking the editor dirty for the programmatic onChange that fires
  // when we first push loaded content into CodeMirror.
  const hydratingRef = useRef(false)

  const languageExtensions = useMemo(
    () => getLanguageExtension(script.language),
    [script.language]
  )

  const isDirty = content !== savedContent

  useEffect(() => {
    setNameDraft(script.name)
    setIsEditingName(false)
  }, [script.id, script.name])

  useEffect(() => {
    setDescription(script.description ?? '')
    setDescriptionDraft(script.description ?? '')
    setIsEditingDescription(false)
  }, [script.id, script.description])

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
      const updated = await updateScript(script.id, { name: trimmedName })
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
      const updated = await updateScript(script.id, { description: trimmed })
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
        </div>

        <div className="action-buttons">
          {previewable && (
            <Button
              label={showPreview ? 'Hide Preview' : 'Show Preview'}
              icon="pi pi-eye"
              className="p-button-outlined"
              onClick={() => setShowPreview(v => !v)}
              data-testid="script-preview-button"
            />
          )}
          <Button
            label="Download"
            icon="pi pi-download"
            className="p-button-outlined"
            onClick={handleDownload}
            disabled={isLoading}
          />
          <Button
            label={isSaving ? 'Saving...' : 'Save'}
            icon="pi pi-save"
            onClick={handleSave}
            disabled={!isDirty || isSaving || isLoading}
            data-testid="script-save"
          />
        </div>
      </div>

      <div
        className="script-editor-description"
        data-testid="script-description"
      >
        {isEditingDescription ? (
          <div className="script-description-edit">
            <InputTextarea
              value={descriptionDraft}
              onChange={e => setDescriptionDraft(e.target.value)}
              rows={2}
              autoResize
              placeholder="Describe what this script does…"
              data-testid="script-description-input"
            />
            <div className="script-description-actions">
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
            </div>
          </div>
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

      {error && <div className="script-editor-error">{error}</div>}

      <div className={`script-editor-body${showPreview ? ' has-preview' : ''}`}>
        {isLoading ? (
          <div className="script-editor-loading">
            <i className="pi pi-spin pi-spinner" />
            <span>Loading source...</span>
          </div>
        ) : (
          <>
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
            {showPreview && (
              <div className="script-editor-preview">
                {previewKind === 'scene' ? (
                  <Suspense
                    fallback={
                      <div className="script-editor-loading">
                        <i className="pi pi-spin pi-spinner" /> Loading preview…
                      </div>
                    }
                  >
                    <ScriptScenePreview
                      language={script.language}
                      content={content}
                    />
                  </Suspense>
                ) : (
                  <ScriptPreview language={script.language} content={content} />
                )}
              </div>
            )}
          </>
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
