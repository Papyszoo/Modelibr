import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Checkbox } from 'primereact/checkbox'
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
  const [isAudioLoaded, setIsAudioLoaded] = useState(false)

  useEffect(() => {
    if (!waveformRef.current) return

    // Initialize wavesurfer with pre-calculated peaks if available
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

    // Use pre-calculated peaks from backend if available
    if (sound.peaks) {
      try {
        const peakData = JSON.parse(sound.peaks)
        if (Array.isArray(peakData) && peakData.length > 0) {
          // Load peaks only for visualization - audio will be loaded on play
          ws.load('', peakData, sound.duration || 0)
        }
      } catch (parseError) {
        // JSON parsing failed - peaks data is invalid
        console.warn('Failed to parse peaks data:', parseError)
      }
    }

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))
    ws.on('ready', () => setIsAudioLoaded(true))

    return () => {
      ws.destroy()
    }
  }, [sound.peaks, sound.duration])

  const handlePlayPause = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!wavesurferRef.current) return

    // If audio not loaded yet, load the full audio file
    if (!isAudioLoaded) {
      const audioUrl = ApiClient.getFileUrl(sound.fileId.toString())
      try {
        await wavesurferRef.current.load(audioUrl)
        // The 'ready' event will set isAudioLoaded to true
        wavesurferRef.current.play()
      } catch (error) {
        console.error('Failed to load audio:', error)
      }
    } else {
      wavesurferRef.current.playPause()
    }
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
      <div className="sound-select-checkbox" onClick={onSelect}>
        <Checkbox checked={isSelected} readOnly />
      </div>

      <div className="sound-waveform-container">
        {sound.peaks ? (
          <div ref={waveformRef} className="sound-waveform" />
        ) : (
          <div className="sound-waveform-placeholder">
            <i className="pi pi-volume-up" />
          </div>
        )}

        <button
          className={`sound-play-btn ${isPlaying ? 'playing' : ''}`}
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
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
