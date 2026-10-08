import { type JSX, type PointerEvent, useRef } from 'react'

import type { VfxComponent, VfxComponentType, VfxDefinition } from '../types'

const SNAP = 0.05
const MIN_DURATION = 0.05

const ICONS: Record<VfxComponentType, string> = {
  particles: 'pi pi-sparkles',
  mesh: 'pi pi-box',
  light: 'pi pi-sun',
  sound: 'pi pi-volume-up',
}

interface VfxTimelineProps {
  definition: VfxDefinition
  time: number
  selectedId: string | null
  onSelect: (id: string) => void
  onSeek: (time: number) => void
  onChangeTiming: (id: string, start: number, duration: number) => void
}

const snap = (value: number) => Math.round(value / SNAP) * SNAP
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Tick spacing that keeps roughly ten labels across the effect. */
function tickStep(duration: number): number {
  for (const step of [0.1, 0.25, 0.5, 1, 2, 5, 10]) {
    if (duration / step <= 12) return step
  }
  return 10
}

/**
 * One track per component on a shared clock.
 *
 * A bar is the component's life on the timeline: drag it to move the start,
 * drag its right edge to change the duration. Both snap to 50 ms and stay
 * inside the effect, so a drag can never produce a definition the server
 * would reject. Keyframes show as markers on the bar.
 */
export function VfxTimeline({
  definition,
  time,
  selectedId,
  onSelect,
  onSeek,
  onChangeTiming,
}: VfxTimelineProps): JSX.Element {
  const rulerRef = useRef<HTMLDivElement>(null)
  const { duration } = definition
  const percent = (seconds: number) => `${(seconds / duration) * 100}%`

  const timeAt = (clientX: number): number => {
    const rect = rulerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration)
  }

  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(timeAt(event.clientX))
  }

  const step = tickStep(duration)
  const ticks: number[] = []
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(t)

  return (
    <div className="vfx-timeline" data-testid="vfx-timeline">
      <div className="vfx-timeline-row vfx-timeline-ruler-row">
        <div className="vfx-timeline-label vfx-timeline-time">
          {time.toFixed(2)} / {duration.toFixed(2)} s
        </div>
        <div
          ref={rulerRef}
          className="vfx-timeline-ruler"
          data-testid="vfx-timeline-ruler"
          onPointerDown={scrub}
          onPointerMove={event => {
            if (event.buttons === 1) onSeek(timeAt(event.clientX))
          }}
        >
          {ticks.map(t => (
            <span
              key={t.toFixed(3)}
              className="vfx-timeline-tick"
              style={{ left: percent(t) }}
            >
              {Number(t.toFixed(2))}
            </span>
          ))}
          <div
            className="vfx-timeline-playhead"
            style={{ left: percent(time) }}
          />
        </div>
      </div>

      <div className="vfx-timeline-tracks">
        <div className="vfx-timeline-playhead-rail" aria-hidden="true">
          <div
            className="vfx-timeline-playhead"
            style={{ left: percent(time) }}
          />
        </div>
        {definition.components.length === 0 ? (
          <p className="vfx-timeline-empty">
            Add a component to start building the effect.
          </p>
        ) : (
          definition.components.map(component => (
            <TimelineTrack
              key={component.id}
              component={component}
              duration={duration}
              time={time}
              selected={component.id === selectedId}
              onSelect={onSelect}
              onChangeTiming={onChangeTiming}
              laneWidth={() =>
                rulerRef.current?.getBoundingClientRect().width ?? 1
              }
            />
          ))
        )}
      </div>
    </div>
  )
}

function TimelineTrack({
  component,
  duration,
  time,
  selected,
  onSelect,
  onChangeTiming,
  laneWidth,
}: {
  component: VfxComponent
  duration: number
  time: number
  selected: boolean
  onSelect: (id: string) => void
  onChangeTiming: (id: string, start: number, duration: number) => void
  laneWidth: () => number
}): JSX.Element {
  const drag = useRef<{
    mode: 'move' | 'resize'
    originX: number
    start: number
    duration: number
  } | null>(null)

  const begin = (
    event: PointerEvent<HTMLDivElement>,
    mode: 'move' | 'resize'
  ) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelect(component.id)
    drag.current = {
      mode,
      originX: event.clientX,
      start: component.start,
      duration: component.duration,
    }
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) return
    const delta = ((event.clientX - state.originX) / laneWidth()) * duration
    if (state.mode === 'move') {
      const start = clamp(
        snap(state.start + delta),
        0,
        duration - state.duration
      )
      if (start !== component.start) {
        onChangeTiming(component.id, start, state.duration)
      }
    } else {
      const length = clamp(
        snap(state.duration + delta),
        MIN_DURATION,
        duration - state.start
      )
      if (length !== component.duration) {
        onChangeTiming(component.id, state.start, length)
      }
    }
  }

  const end = () => {
    drag.current = null
  }

  const keyTimes = Object.values(component.tracks ?? {})
    .flatMap(keys => keys ?? [])
    .map(([t]) => t)

  const playing =
    time >= component.start && time < component.start + component.duration

  return (
    <div
      className={`vfx-timeline-row${selected ? ' is-selected' : ''}`}
      data-testid="vfx-timeline-track"
      data-component-id={component.id}
    >
      <button
        type="button"
        className="vfx-timeline-label"
        onClick={() => onSelect(component.id)}
        aria-pressed={selected}
      >
        <i className={ICONS[component.type]} aria-hidden="true" />
        <span>{component.name}</span>
      </button>
      <div className="vfx-timeline-lane">
        <div
          className={`vfx-timeline-bar vfx-timeline-bar-${component.type}${playing ? ' is-playing' : ''}`}
          style={{
            left: `${(component.start / duration) * 100}%`,
            width: `${(component.duration / duration) * 100}%`,
          }}
          data-testid="vfx-timeline-bar"
          onPointerDown={event => begin(event, 'move')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          title={`${component.start.toFixed(2)} s - ${(component.start + component.duration).toFixed(2)} s`}
        >
          {keyTimes.map((t, index) => (
            <span
              key={`${t}-${index}`}
              className="vfx-timeline-key"
              style={{ left: `${(t / component.duration) * 100}%` }}
            />
          ))}
          <div
            className="vfx-timeline-bar-handle"
            onPointerDown={event => begin(event, 'resize')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            aria-label={`Change the duration of ${component.name}`}
          />
        </div>
      </div>
    </div>
  )
}
