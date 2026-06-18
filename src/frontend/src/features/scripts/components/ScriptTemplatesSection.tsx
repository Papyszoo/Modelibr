import './ScriptTemplatesSection.css'

import { useQueryClient } from '@tanstack/react-query'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import CodeMirror from '@uiw/react-codemirror'
import { Button } from 'primereact/button'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useMemo, useState } from 'react'

import { type ScriptTemplateDto } from '@/types'

import { useScriptTemplatesQuery } from '../api/queries'
import {
  createScriptTemplate,
  deleteScriptTemplate,
  updateScriptTemplate,
} from '../api/templateApi'
import {
  getLanguageExtension,
  getLanguageLabel,
  SCRIPT_LANGUAGES,
} from '../utils/languages'

interface DraftState {
  id: number | null
  name: string
  language: string
  description: string
  content: string
}

const EMPTY_DRAFT: DraftState = {
  id: null,
  name: '',
  language: 'csharp',
  description: '',
  content: '',
}

export function ScriptTemplatesSection() {
  const queryClient = useQueryClient()
  const { data: templates = [], isLoading } = useScriptTemplatesQuery()

  const [showDialog, setShowDialog] = useState(false)
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  const { builtIns, custom } = useMemo(() => {
    return {
      builtIns: templates.filter(t => t.isBuiltIn),
      custom: templates.filter(t => !t.isBuiltIn),
    }
  }, [templates])

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['scriptTemplates'] })

  const openCreate = () => {
    setDraft(EMPTY_DRAFT)
    setShowDialog(true)
  }

  const openEdit = (template: ScriptTemplateDto) => {
    setDraft({
      id: Number(template.id),
      name: template.name,
      language: template.language,
      description: template.description ?? '',
      content: template.content,
    })
    setShowDialog(true)
  }

  const duplicateFrom = (template: ScriptTemplateDto) => {
    setDraft({
      id: null,
      name: `${template.name} copy`,
      language: template.language,
      description: template.description ?? '',
      content: template.content,
    })
    setShowDialog(true)
  }

  const canSave = draft.name.trim().length > 0 && draft.language.length > 0

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        name: draft.name.trim(),
        language: draft.language,
        content: draft.content,
        description: draft.description.trim() || undefined,
      }
      if (draft.id != null) {
        await updateScriptTemplate(draft.id, payload)
      } else {
        await createScriptTemplate(payload)
      }
      await invalidate()
      setShowDialog(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (template: ScriptTemplateDto) => {
    confirmDialog({
      message: `Delete the template "${template.name}"?`,
      header: 'Delete Template',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        await deleteScriptTemplate(Number(template.id))
        await invalidate()
      },
    })
  }

  return (
    <div
      className="script-templates-section"
      data-testid="script-templates-section"
    >
      <ConfirmDialog />
      <p className="script-templates-intro">
        Templates give new scripts a head start. Built-in templates ship with
        the app; create your own below — they appear in the “New Script” dialog.
      </p>

      <div className="script-templates-toolbar">
        <Button
          label="New Template"
          icon="pi pi-plus"
          onClick={openCreate}
          data-testid="template-new"
        />
      </div>

      {isLoading ? (
        <div className="script-templates-loading">
          <i className="pi pi-spin pi-spinner" /> Loading templates…
        </div>
      ) : (
        <>
          <h4 className="script-templates-heading">Your templates</h4>
          {custom.length === 0 ? (
            <p className="script-templates-empty">
              No custom templates yet. Create one or duplicate a built-in.
            </p>
          ) : (
            <ul
              className="script-templates-list"
              data-testid="custom-templates"
            >
              {custom.map(t => (
                <li key={t.id} className="script-template-row">
                  <div className="script-template-info">
                    <span className="script-template-name">{t.name}</span>
                    <span className="script-template-lang">
                      {getLanguageLabel(t.language)}
                    </span>
                    {t.description && (
                      <span className="script-template-desc">
                        {t.description}
                      </span>
                    )}
                  </div>
                  <div className="script-template-actions">
                    <Button
                      icon="pi pi-pencil"
                      className="p-button-text p-button-rounded"
                      onClick={() => openEdit(t)}
                      tooltip="Edit"
                    />
                    <Button
                      icon="pi pi-trash"
                      className="p-button-text p-button-rounded p-button-danger"
                      onClick={() => handleDelete(t)}
                      tooltip="Delete"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h4 className="script-templates-heading">Built-in templates</h4>
          <ul className="script-templates-list">
            {builtIns.map(t => (
              <li key={t.id} className="script-template-row is-builtin">
                <div className="script-template-info">
                  <span className="script-template-name">{t.name}</span>
                  <span className="script-template-lang">
                    {getLanguageLabel(t.language)}
                  </span>
                  {t.description && (
                    <span className="script-template-desc">
                      {t.description}
                    </span>
                  )}
                </div>
                <div className="script-template-actions">
                  <Button
                    icon="pi pi-copy"
                    label="Duplicate"
                    className="p-button-text p-button-sm"
                    onClick={() => duplicateFrom(t)}
                    tooltip="Create a custom copy"
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog
        header={draft.id != null ? 'Edit Template' : 'New Template'}
        visible={showDialog}
        onHide={() => setShowDialog(false)}
        style={{ width: '720px' }}
        data-testid="template-dialog"
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              className="p-button-text"
              onClick={() => setShowDialog(false)}
              disabled={saving}
            />
            <Button
              label={saving ? 'Saving...' : 'Save'}
              icon="pi pi-check"
              onClick={handleSave}
              disabled={!canSave || saving}
              data-testid="template-save"
            />
          </div>
        }
      >
        <div className="p-fluid">
          <div className="field">
            <label htmlFor="templateName">Name *</label>
            <InputText
              id="templateName"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              autoFocus
              data-testid="template-name"
            />
          </div>
          <div className="field">
            <label htmlFor="templateLanguage">Language *</label>
            <Dropdown
              inputId="templateLanguage"
              value={draft.language}
              options={SCRIPT_LANGUAGES}
              onChange={e => setDraft(d => ({ ...d, language: e.value }))}
              filter
              data-testid="template-language"
            />
          </div>
          <div className="field">
            <label htmlFor="templateDescription">Description</label>
            <InputTextarea
              id="templateDescription"
              value={draft.description}
              onChange={e =>
                setDraft(d => ({ ...d, description: e.target.value }))
              }
              rows={2}
              autoResize
            />
          </div>
          <div className="field">
            <label>Content</label>
            <div className="template-content-editor">
              <CodeMirror
                value={draft.content}
                theme={vscodeDark}
                height="280px"
                extensions={getLanguageExtension(draft.language)}
                onChange={value => setDraft(d => ({ ...d, content: value }))}
                data-testid="template-content"
              />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
