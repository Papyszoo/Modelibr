import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
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
  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!waveformRef.current) return

    // Initialize wavesurfer and load the actual audio file
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgb(100, 116, 139)',
      progressColor: 'rgb(59, 130, 246)',
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 60,
      normalize: true,
      interact: false,
    })

    wavesurferRef.current = ws

    // Load the actual audio file to render waveform and enable playback
    const audioUrl = ApiClient.getFileUrl(sound.fileId.toString())
    ws.load(audioUrl)

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))
    ws.on('ready', () => setIsReady(true))

    return () => {
      ws.destroy()
    }
  }, [sound.fileId])

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!wavesurferRef.current || !isReady) return

    wavesurferRef.current.playPause()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

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
      <div
        className="sound-select-checkbox"
        onClick={onSelect}
      >
        <i className={`pi ${isSelected ? 'pi-check-square' : 'pi-stop'}`} />
      </div>

      <div className="sound-waveform-container">
        <div ref={waveformRef} className="sound-waveform" />

        <button
          className={`sound-play-btn ${isPlaying ? 'playing' : ''}`}
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
          disabled={!isReady}
        >
          <i className={`pi ${isPlaying ? 'pi-pause' : 'pi-play'}`} />
        </button>
      </div>

      <div className="sound-info">
        <h3 className="sound-name" title={sound.name}>
          {sound.name}
        </h3>
        <div className="sound-meta">
          <span className="sound-duration">
            {formatDuration(sound.duration)}
          </span>
          <span className="sound-size">{formatFileSize(sound.fileSizeBytes)}</span>
        </div>
      </div>
    </div>
  )
}

export default SoundCard
