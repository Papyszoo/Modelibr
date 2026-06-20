import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useEffect, useMemo, useState } from 'react'

import { useScriptTemplatesQuery } from '../api/queries'
import { SCRIPT_LANGUAGES } from '../utils/languages'

interface ScriptCreateDialogProps {
  visible: boolean
  saving: boolean
  onHide: () => void
  onCreate: (values: {
    name: string
    language: string
    description?: string
    content?: string
  }) => void
}

const BLANK_TEMPLATE = '__blank__'

export function ScriptCreateDialog({
  visible,
  saving,
  onHide,
  onCreate,
}: ScriptCreateDialogProps) {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('lua')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState<string>(BLANK_TEMPLATE)

  const { data: templates = [] } = useScriptTemplatesQuery({
    queryConfig: { enabled: visible },
  })

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (visible) {
      setName('')
      setLanguage('lua')
      setDescription('')
      setTemplateId(BLANK_TEMPLATE)
    }
  }, [visible])

  const templateOptions = useMemo(
    () => [
      { label: 'Blank', value: BLANK_TEMPLATE },
      ...templates.map(t => ({
        label: t.isBuiltIn ? `${t.name} (built-in)` : t.name,
        value: t.id,
      })),
    ],
    [templates]
  )

  const handleTemplateChange = (value: string) => {
    setTemplateId(value)
    const template = templates.find(t => t.id === value)
    if (template) {
      setLanguage(template.language)
      if (!description && template.description) {
        setDescription(template.description)
      }
    }
  }

  const canCreate = name.trim().length > 0 && language.length > 0

  const handleCreate = () => {
    if (!canCreate) return
    const template = templates.find(t => t.id === templateId)
    onCreate({
      name: name.trim(),
      language,
      description: description.trim() || undefined,
      content: template?.content,
    })
  }

  return (
    <Dialog
      header="New Script"
      visible={visible}
      onHide={onHide}
      style={{ width: '460px' }}
      data-testid="script-create-dialog"
      footer={
        <div>
          <Button
            label="Cancel"
            icon="pi pi-times"
            className="p-button-text"
            onClick={onHide}
            disabled={saving}
            data-testid="script-create-cancel"
          />
          <Button
            label={saving ? 'Creating...' : 'Create & Edit'}
            icon="pi pi-check"
            onClick={handleCreate}
            disabled={!canCreate || saving}
            data-testid="script-create-submit"
          />
        </div>
      }
    >
      <div className="p-fluid">
        <div className="field">
          <label htmlFor="scriptTemplate">Start from template</label>
          <Dropdown
            inputId="scriptTemplate"
            value={templateId}
            options={templateOptions}
            onChange={e => handleTemplateChange(e.value)}
            filter
            data-testid="script-create-template"
          />
        </div>
        <div className="field">
          <label htmlFor="scriptName">Name *</label>
          <InputText
            id="scriptName"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
            }}
            autoFocus
            data-testid="script-create-name"
          />
        </div>
        <div className="field">
          <label htmlFor="scriptLanguage">Language *</label>
          <Dropdown
            inputId="scriptLanguage"
            value={language}
            options={SCRIPT_LANGUAGES}
            onChange={e => setLanguage(e.value)}
            filter
            data-testid="script-create-language"
          />
        </div>
        <div className="field">
          <label htmlFor="scriptDescription">Description</label>
          <InputTextarea
            id="scriptDescription"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            autoResize
            placeholder="Optional — what does this script do?"
            data-testid="script-create-description"
          />
        </div>
      </div>
    </Dialog>
  )
}
