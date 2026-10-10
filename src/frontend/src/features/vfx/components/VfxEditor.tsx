import './VfxEditor.css'

import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { getFileUrl } from '@/features/models/api/modelApi'
import { ErrorState, LoadingState } from '@/shared/components'

import { useUpdateVfxMutation, useVfxQuery } from '../api/queries'
import { getVfxGodotExportUrl, vfxProblems } from '../api/vfxApi'
import { useVfxAssetFiles } from '../hooks/useVfxAssets'
import { createComponent } from '../lib/vfxDefaults'
import type {
  VfxComponent,
  VfxComponentType,
  VfxDefinition,
  VfxProblem,
} from '../types'
import { type VfxAssetKind, VfxAssetPicker } from './VfxAssetPicker'
import { VfxInspector } from './VfxInspector'
import { VfxPreview } from './VfxPreview'
import { VfxTimeline } from './VfxTimeline'

const AUTOSAVE_MS = 600

/** Keeps every component inside the effect after its duration shrinks. */
// eslint-disable-next-line react-refresh/only-export-components -- exported so the timing rule can be unit-tested
export function fitComponents(
  components: VfxComponent[],
  duration: number
): VfxComponent[] {
  return components.map(component => {
    const length = Math.min(component.duration, duration)
    const start = Math.min(component.start, duration - length)
    return length === component.duration && start === component.start
      ? component
      : { ...component, start, duration: length }
  })
}

/** Problems that belong to component `index`, by the server's path prefix. */
function problemsFor(problems: VfxProblem[], index: number): VfxProblem[] {
  const prefix = `components[${index}]`
  return problems.filter(problem => problem.path.startsWith(prefix))
}

/**
 * The VFX editor: live preview, timeline and the selected component's
 * settings. Every edit autosaves; a rejected save shows the server's problems
 * next to the component they are about, and the draft is kept, never lost.
 */
export function VfxEditor({ vfxId }: { vfxId: number }): JSX.Element {
  const query = useVfxQuery(vfxId)
  const update = useUpdateVfxMutation(vfxId)

  const [name, setName] = useState('')
  const [definition, setDefinition] = useState<VfxDefinition | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [picking, setPicking] = useState<VfxAssetKind | null>(null)
  const [problems, setProblems] = useState<VfxProblem[]>([])
  const [dirty, setDirty] = useState(false)

  // Seed the draft once per effect; later refetches must not clobber edits.
  const seededFor = useRef<number | null>(null)
  useEffect(() => {
    if (query.data && seededFor.current !== vfxId) {
      seededFor.current = vfxId
      setName(query.data.name)
      setDefinition(query.data.definition)
      setSelectedId(query.data.definition.components[0]?.id ?? null)
    }
  }, [query.data, vfxId])

  const edit = useCallback((next: VfxDefinition) => {
    setDefinition(next)
    setDirty(true)
  }, [])

  // The latest autosave the debounce still owes. Read on unmount so a tab
  // switch inside the window flushes the edit instead of cancelling it: the
  // effect cleanup cleared the timer and the change existed only in the
  // browser. Held in a ref because the flush effect must not re-run per edit.
  const pendingSave = useRef<{
    dirty: boolean
    definition: VfxDefinition | null
    name: string
    update: typeof update
  }>({ dirty: false, definition: null, name: '', update })
  pendingSave.current = { dirty, definition, name, update }

  useEffect(() => {
    return () => {
      const {
        dirty: wasDirty,
        definition: flushed,
        name: flushedName,
        update: mutation,
      } = pendingSave.current
      if (wasDirty && flushed) {
        mutation.mutate({
          name: flushedName.trim() || 'Untitled effect',
          definition: flushed,
        })
      }
    }
  }, [])

  // Autosave, debounced. `dirty` is cleared only once the save succeeds, so a
  // rejected save stays dirty: the state still says "not saved" and the unmount
  // flush below still owes the edit instead of dropping it.
  useEffect(() => {
    if (!dirty || !definition) return
    const handle = window.setTimeout(() => {
      update.mutate(
        { name: name.trim() || 'Untitled effect', definition },
        {
          onSuccess: () => {
            setProblems([])
            setDirty(false)
          },
          onError: error => setProblems(vfxProblems(error)),
        }
      )
    }, AUTOSAVE_MS)
    return () => window.clearTimeout(handle)
    // `update` is a fresh object each render; the mutation itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, definition, name])

  // Playback clock.
  useEffect(() => {
    if (!playing || !definition) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setTime(current => {
        const next = current + dt
        if (next < definition.duration) return next
        if (definition.loop) return next % definition.duration
        setPlaying(false)
        return definition.duration
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, definition])

  const { spriteFiles, soundFiles } = useVfxAssetFiles(
    definition ?? { version: 1, duration: 1, loop: false, components: [] }
  )
  useSoundPlayback(definition, time, playing, soundFiles)

  const selectedIndex = useMemo(
    () => definition?.components.findIndex(c => c.id === selectedId) ?? -1,
    [definition, selectedId]
  )

  if (query.isLoading) return <LoadingState message="Loading effect..." />
  if (query.isError || !query.data) {
    return <ErrorState message="This effect could not be loaded." />
  }
  if (!definition) return <LoadingState message="Loading effect..." />

  const addComponent = (
    type: VfxComponentType,
    asset?: { id: number; versionId?: number | null }
  ) => {
    const component = createComponent(definition, type, asset)
    edit({ ...definition, components: [...definition.components, component] })
    setSelectedId(component.id)
  }

  const replaceComponent = (next: VfxComponent) =>
    edit({
      ...definition,
      components: definition.components.map(c => (c.id === next.id ? next : c)),
    })

  const togglePlay = () => {
    if (!playing && time >= definition.duration) setTime(0)
    setPlaying(value => !value)
  }

  const saveFailed = update.isError
  // A rejection (or a server validation problem) outranks "dirty": `dirty` now
  // survives a failed save, so checking it first would show "Saving..." forever.
  const saveState = update.isPending
    ? 'Saving...'
    : problems.length > 0
      ? `${problems.length} problem${problems.length === 1 ? '' : 's'} - not saved`
      : saveFailed
        ? 'Save failed - not saved'
        : dirty
          ? 'Saving...'
          : 'Saved'

  const selected =
    selectedIndex >= 0 ? definition.components[selectedIndex] : null
  const unplaced = problems.filter(
    problem => !problem.path.startsWith('components[')
  )

  return (
    <div className="vfx-editor" data-testid="vfx-editor">
      <header className="vfx-toolbar">
        <input
          className="vfx-title"
          aria-label="Effect name"
          value={name}
          maxLength={200}
          onChange={event => {
            setName(event.target.value)
            setDirty(true)
          }}
        />

        <div className="vfx-toolbar-group vfx-transport">
          <button
            type="button"
            className="vfx-icon-button"
            onClick={() => {
              setPlaying(false)
              setTime(0)
            }}
            aria-label="Rewind"
          >
            <i className="pi pi-step-backward" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="vfx-play-button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            data-testid="vfx-play"
          >
            <i
              className={playing ? 'pi pi-pause' : 'pi pi-play'}
              aria-hidden="true"
            />
          </button>
          <span className="vfx-time" data-testid="vfx-time">
            {time.toFixed(2)}s
          </span>
          <span className="vfx-toolbar-divider" aria-hidden="true" />
          <label className="vfx-toolbar-field">
            <input
              type="checkbox"
              checked={definition.loop}
              onChange={event =>
                edit({ ...definition, loop: event.target.checked })
              }
            />
            Loop
          </label>
          <label className="vfx-toolbar-field">
            Length
            <input
              className="vfx-length-input"
              type="number"
              aria-label="Effect length in seconds"
              value={definition.duration}
              min={0.1}
              max={60}
              step={0.1}
              onChange={event => {
                const value = Number(event.target.value)
                if (!Number.isFinite(value) || value < 0.1 || value > 60) return
                edit({
                  ...definition,
                  duration: value,
                  components: fitComponents(definition.components, value),
                })
                setTime(t => Math.min(t, value))
              }}
            />
            s
          </label>
        </div>

        <div
          className="vfx-toolbar-group vfx-segmented"
          role="group"
          aria-label="Add component"
        >
          <button
            type="button"
            className="vfx-text-button vfx-segment"
            onClick={() => addComponent('particles')}
            data-testid="vfx-add-particles"
          >
            <i className="pi pi-sparkles" aria-hidden="true" /> Particles
          </button>
          <button
            type="button"
            className="vfx-text-button vfx-segment"
            onClick={() => setPicking('model')}
            data-testid="vfx-add-mesh"
          >
            <i className="pi pi-box" aria-hidden="true" /> Mesh
          </button>
          <button
            type="button"
            className="vfx-text-button vfx-segment"
            onClick={() => addComponent('light')}
            data-testid="vfx-add-light"
          >
            <i className="pi pi-sun" aria-hidden="true" /> Light
          </button>
          <button
            type="button"
            className="vfx-text-button vfx-segment"
            onClick={() => setPicking('sound')}
            data-testid="vfx-add-sound"
          >
            <i className="pi pi-volume-up" aria-hidden="true" /> Sound
          </button>
        </div>

        <div className="vfx-toolbar-group vfx-toolbar-end">
          <span
            className={`vfx-save-state${problems.length > 0 || saveFailed ? ' has-problems' : ''}`}
            data-testid="vfx-save-state"
          >
            {saveState}
          </span>
          <a
            className="vfx-text-button"
            href={getVfxGodotExportUrl(vfxId)}
            download
            data-testid="vfx-export-godot"
          >
            <i className="pi pi-download" aria-hidden="true" /> Godot
          </a>
        </div>
      </header>

      {picking ? (
        <div className="vfx-add-picker">
          <p>
            Choose a {picking === 'model' ? 'model for the mesh' : 'sound'}:
          </p>
          <VfxAssetPicker
            kind={picking}
            onCancel={() => setPicking(null)}
            onPick={asset => {
              addComponent(picking === 'model' ? 'mesh' : 'sound', asset)
              setPicking(null)
            }}
          />
        </div>
      ) : null}

      {unplaced.length > 0 ? (
        <ul className="vfx-problems vfx-problems-effect">
          {unplaced.map(problem => (
            <li key={`${problem.path}-${problem.message}`}>
              {problem.path}: {problem.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="vfx-workspace">
        <VfxPreview
          definition={definition}
          time={time}
          selectedId={selectedId}
          spriteFiles={spriteFiles}
        />
        {selected ? (
          <VfxInspector
            key={selected.id}
            component={selected}
            effectDuration={definition.duration}
            time={time}
            problems={problemsFor(problems, selectedIndex)}
            onChange={replaceComponent}
            onDelete={() => {
              edit({
                ...definition,
                components: definition.components.filter(
                  c => c.id !== selected.id
                ),
              })
              setSelectedId(null)
            }}
          />
        ) : (
          <aside className="vfx-inspector vfx-inspector-empty">
            <p className="vfx-muted">
              Select a track to edit it, or add a component from the toolbar.
            </p>
          </aside>
        )}
      </div>

      <VfxTimeline
        definition={definition}
        time={time}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onSeek={t => {
          setPlaying(false)
          setTime(t)
        }}
        onChangeTiming={(id, start, duration) => {
          const component = definition.components.find(c => c.id === id)
          if (component) replaceComponent({ ...component, start, duration })
        }}
      />
    </div>
  )
}

/**
 * Starts each sound when playback crosses its start time. Scrubbing never
 * plays sound; pausing stops whatever is playing.
 */
function useSoundPlayback(
  definition: VfxDefinition | null,
  time: number,
  playing: boolean,
  soundFiles: Map<number, number>
) {
  const previous = useRef(time)
  const active = useRef<HTMLAudioElement[]>([])

  useEffect(() => {
    const before = previous.current
    previous.current = time
    if (!playing || !definition) return
    // A loop wrap restarts the clock; treat it as crossing from zero.
    const from = time < before ? -0.001 : before
    for (const component of definition.components) {
      if (component.type !== 'sound' || !component.sound) continue
      if (from < component.start && component.start <= time) {
        const fileId = soundFiles.get(component.sound.soundId)
        if (!fileId) continue
        const audio = new Audio(getFileUrl(String(fileId)))
        audio.volume = component.sound.volume
        void audio.play().catch(() => undefined)
        active.current.push(audio)
      }
    }
  }, [definition, playing, soundFiles, time])

  useEffect(() => {
    if (playing) return
    for (const audio of active.current) audio.pause()
    active.current = []
  }, [playing])
}
