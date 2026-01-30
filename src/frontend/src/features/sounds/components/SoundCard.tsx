import { useCallback, useEffect, useRef, useState } from 'react'
import { SoundDto } from '../../../types'
import ApiClient from '../../../services/ApiClient'
import { formatDuration } from '../../../utils/audioUtils'
import './SoundCard.css'

interface SoundCardProps {
  sound: SoundDto
  isSelected: boolean
  isDragging: boolean
  onSelect: (e: React.MouseEvent) => void
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function SoundCard({
  sound,
  isSelected,
  isDragging,
  onSelect,
  onClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
}: SoundCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackPosition, setPlaybackPosition] = useState(0) // 0-1
  const [isReady, setIsReady] = useState(false)

  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current
    const container = waveformContainerRef.current
    if (!canvas) return
    if (!container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const waveformStartX = 0
    const waveformWidth = canvas.width
    const x = waveformStartX + playbackPosition * waveformWidth
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)' // Brighter blue for dark mode
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()

    ctx.fillStyle = 'rgba(96, 165, 250, 0.18)'
    ctx.fillRect(waveformStartX, 0, x - waveformStartX, canvas.height)
  }, [playbackPosition])

  // Keep canvas in sync with the rendered waveform size
  useEffect(() => {
    const container = waveformContainerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const updateCanvasSize = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      drawOverlay()
    }

    updateCanvasSize()

    // React to container resizes so the playhead stays aligned
    const resizeObserver = new ResizeObserver(() => updateCanvasSize())
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  // Update playback position while playing
  useEffect(() => {
    if (!isPlaying || !audioRef.current) return

    const audio = audioRef.current
    const updatePosition = () => {
      if (audio.duration > 0) {
        setPlaybackPosition(audio.currentTime / audio.duration)
      }
    }

    // Update more frequently for smoother animation
    const interval = setInterval(updatePosition, 50)
    return () => clearInterval(interval)
  }, [isPlaying])

  // Draw playback position overlay on canvas
  useEffect(() => {
    drawOverlay()
  }, [drawOverlay, isPlaying])

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!audioRef.current || !isReady) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
  }

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!audioRef.current) return

    audioRef.current.currentTime = 0
    audioRef.current.pause()
    setPlaybackPosition(0)
    setIsPlaying(false)
  }

  const handleAudioLoad = () => {
    setIsReady(true)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current && audioRef.current.duration > 0) {
      setPlaybackPosition(
        audioRef.current.currentTime / audioRef.current.duration
      )
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Use waveform URL from backend response (only if waveform exists)
  const waveformUrl = sound.waveformUrl
    ? `${ApiClient.getBaseURL()}${sound.waveformUrl}`
    : null

  return (
    <div
      data-sound-id={sound.id}
      className={`sound-card ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <audio
        ref={audioRef}
        src={ApiClient.getFileUrl(sound.fileId.toString())}
        onLoadedMetadata={handleAudioLoad}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          setPlaybackPosition(0)
        }}
        onTimeUpdate={handleTimeUpdate}
        preload="metadata"
      />

      <div className="sound-select-checkbox" onClick={onSelect}>
        <i className={`pi ${isSelected ? 'pi-check-square' : 'pi-stop'}`} />
      </div>

      <div ref={waveformContainerRef} className="sound-waveform-container">
        {waveformUrl ? (
          <img
            src={waveformUrl}
            alt="Waveform"
            className="sound-waveform"
            loading="lazy"
            onLoad={drawOverlay}
          />
        ) : (
          <div className="sound-waveform-placeholder">
            <i className="pi pi-volume-up" />
          </div>
        )}

        {/* Canvas overlay for playback position */}
        <canvas
          ref={canvasRef}
          className="sound-waveform-overlay"
          width={800}
          height={150}
        />
      </div>

      <div className="sound-info">
        <h3 className="sound-name" title={sound.name}>
          {sound.name}
        </h3>
        <div className="sound-meta">
          <span className="sound-duration">
            {formatDuration(sound.duration)}
          </span>
          <span className="sound-size">
            {formatFileSize(sound.fileSizeBytes)}
          </span>
          <button
            className={`sound-control-btn ${isPlaying ? 'playing' : ''}`}
            onClick={handlePlayPause}
            title={isPlaying ? 'Pause' : 'Play'}
            disabled={!isReady}
          >
            <i className={`pi ${isPlaying ? 'pi-pause' : 'pi-play'}`} />
          </button>
          <button
            className="sound-control-btn ghost"
            onClick={handleReset}
            title="Reset to start"
            disabled={!isReady}
          >
            <i className="pi pi-refresh" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default SoundCard
