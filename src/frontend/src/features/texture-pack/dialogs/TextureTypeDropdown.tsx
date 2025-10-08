import { Dropdown } from 'primereact/dropdown'
import { TextureType } from '../../../types'

interface TextureTypeOption {
  label: string
  value: TextureType
  color: string
  icon: string
}

interface TextureTypeDropdownProps {
  options: TextureTypeOption[]
  value: TextureType | null
  onChange: (value: TextureType) => void
}

export default function TextureTypeDropdown({
  options,
  value,
  onChange,
}: TextureTypeDropdownProps) {
  const textureTypeOptionTemplate = (option: TextureTypeOption) => {
    return (
      <div className="texture-type-option">
        <span
          className="texture-type-badge"
          style={{ backgroundColor: option.color }}
        >
          <i className={`pi ${option.icon}`}></i>
          {option.label}
        </span>
      </div>
    )
  }

  return (
    <div className="p-field">
      <label htmlFor="texture-type" className="p-text-bold">
        Texture Type <span className="p-error">*</span>
      </label>
      <Dropdown
        id="texture-type"
        value={value}
        options={options}
        onChange={e => onChange(e.value)}
        placeholder="Select texture type"
        itemTemplate={textureTypeOptionTemplate}
        valueTemplate={textureTypeOptionTemplate}
      />
      <small className="p-text-secondary">
        Each texture pack can contain only one texture of each type.
      </small>
    </div>
  )
}
