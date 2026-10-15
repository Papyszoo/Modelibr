import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SettingNumberField } from '../SettingNumberField'
import { SettingToggle } from '../SettingToggle'
import { ThumbnailBackgroundField } from '../ThumbnailBackgroundField'

describe('SettingToggle', () => {
  it('reports the next value when clicked', async () => {
    const onChange = jest.fn()
    render(
      <SettingToggle
        id="autoAssignOnImport"
        label="Auto-tag on import"
        isOn
        onChange={onChange}
      />
    )

    const checkbox = screen.getByRole('checkbox', {
      name: 'Auto-tag on import',
    })
    expect(checkbox).toBeChecked()

    await userEvent.click(checkbox)

    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('is disabled while a save is in flight', () => {
    render(
      <SettingToggle
        label="Auto-tag on import"
        isOn
        saving
        onChange={jest.fn()}
      />
    )

    expect(
      screen.getByRole('checkbox', { name: 'Auto-tag on import' })
    ).toBeDisabled()
  })
})

describe('SettingNumberField', () => {
  it('commits a changed value on blur', async () => {
    const onCommit = jest.fn()
    render(
      <SettingNumberField
        id="cleanRecycledFilesAfterDays"
        label="Keep recycled files for (days)"
        value={0}
        min={0}
        max={365}
        onCommit={onCommit}
      />
    )

    const input = screen.getByLabelText('Keep recycled files for (days)')
    await userEvent.clear(input)
    await userEvent.type(input, '30')
    await userEvent.tab()

    expect(onCommit).toHaveBeenCalledWith(30)
  })

  it('reverts out-of-range input instead of saving it', async () => {
    const onCommit = jest.fn()
    render(
      <SettingNumberField
        id="blenderOperationTimeout"
        label="Operation timeout (minutes)"
        value={15}
        min={1}
        max={240}
        onCommit={onCommit}
      />
    )

    const input = screen.getByLabelText(
      'Operation timeout (minutes)'
    ) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '999')
    await userEvent.tab()

    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('15')
  })

  it('does not commit when the value did not change', async () => {
    const onCommit = jest.fn()
    render(
      <SettingNumberField
        id="preMigrationBackupRetention"
        label="Pre-update backups to keep"
        value={3}
        min={1}
        max={10}
        onCommit={onCommit}
      />
    )

    const input = screen.getByLabelText('Pre-update backups to keep')
    await userEvent.click(input)
    await userEvent.tab()

    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('ThumbnailBackgroundField', () => {
  it('switches to a solid colour when transparency is unchecked', async () => {
    const onChange = jest.fn()
    render(
      <ThumbnailBackgroundField background="transparent" onChange={onChange} />
    )

    const transparent = screen.getByRole('checkbox', { name: 'Transparent' })
    expect(transparent).toBeChecked()

    await userEvent.click(transparent)

    expect(onChange).toHaveBeenCalledWith('#ffffff')
  })

  it('shows the colour input for a solid background and saves colour changes', async () => {
    const onChange = jest.fn()
    render(
      <ThumbnailBackgroundField background="#112233" onChange={onChange} />
    )

    const colour = screen.getByLabelText('Thumbnail background colour')
    expect(colour).toHaveValue('#112233')

    // jsdom does not implement the native colour picker; the change event the
    // browser fires after picking is what the component listens for.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Transparent' }))

    expect(onChange).toHaveBeenCalledWith('transparent')
  })

  it('has no colour input while transparent', () => {
    render(
      <ThumbnailBackgroundField background="transparent" onChange={jest.fn()} />
    )

    expect(
      screen.queryByLabelText('Thumbnail background colour')
    ).not.toBeInTheDocument()
  })
})
