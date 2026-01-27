import { useEffect, useRef, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { Region } from 'wavesurfer.js/dist/plugins/regions.js'
import { Button } from 'primereact/button'
import { SoundDto } from '../../../types'
import ApiClient from '../../../services/ApiClient'
import {
  decodeAudio,
  sliceAudioBuffer,
  audioBufferToWav,
  formatDuration,
} from '../../../utils/audioUtils'
import './SoundEditor.css'

interface SoundEditorProps {
  sound: SoundDto
  onClose: () => void
  onDownload: () => void
}

function SoundEditor({ sound, onClose, onDownload }: SoundEditorProps) {
  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const sliceBlobRef = useRef<Blob | null>(null)
  const playingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(sound.duration || 0)
  const [selectedRegion, setSelectedRegion] = useState<{
    start: number
    end: number
  } | null>(null)
  const [sliceUrl, setSliceUrl] = useState<string | null>(null)

  // Load audio and initialize wavesurfer
  useEffect(() => {
    if (!waveformRef.current) return

    const regions = RegionsPlugin.create()
    regionsRef.current = regions

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgb(100, 116, 139)',
      progressColor: 'rgb(59, 130, 246)',
      cursorColor: 'rgb(239, 68, 68)',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 128,
      normalize: true,
      plugins: [regions],
    })

    wavesurferRef.current = ws

    // Load audio file
    const audioUrl = ApiClient.getFileUrl(sound.fileId.toString())
    setIsLoading(true)
    ws.load(audioUrl)

    // Also fetch and decode for slicing
    fetch(audioUrl)
      .then(res => res.blob())
      .then(blob => {
        const mimeType = blob.type || 'audio/mpeg'
        return new File([blob], sound.fileName, { type: mimeType })
      })
      .then(file => decodeAudio(file))
      .then(buffer => {
        audioBufferRef.current = buffer
      })
      .catch(err => console.error('Failed to decode audio for slicing:', err))

    ws.on('ready', () => {
      setIsLoading(false)
      setDuration(ws.getDuration())

      // Create a default region for selection
      regions.addRegion({
        start: 0,
        end: ws.getDuration() * 0.3,
        color: 'rgba(59, 130, 246, 0.3)',
        drag: true,
        resize: true,
      })
    })

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => {
      setIsPlaying(false)
      playingSelectionRef.current = null
    })
    ws.on('finish', () => {
      setIsPlaying(false)
      playingSelectionRef.current = null
    })
    ws.on('timeupdate', time => {
      setCurrentTime(time)
      // Stop at end of selection when playing a region
      const selection = playingSelectionRef.current
      if (selection && time >= selection.end) {
        playingSelectionRef.current = null
        ws.pause()
        ws.setTime(selection.start)
      }
    })

    regions.on('region-updated', (region: Region) => {
      setSelectedRegion({ start: region.start, end: region.end })
      updateSliceUrl(region.start, region.end)
    })

    regions.on('region-created', (region: Region) => {
      setSelectedRegion({ start: region.start, end: region.end })
      updateSliceUrl(region.start, region.end)
    })

    return () => {
      if (sliceUrl) {
        URL.revokeObjectURL(sliceUrl)
      }
      ws.destroy()
    }
  }, [sound.fileId, sound.fileName])

  // Update slice URL when region changes
  const updateSliceUrl = useCallback(
    (start: number, end: number) => {
      if (!audioBufferRef.current) return

      // Clean up previous URL
      if (sliceUrl) {
        URL.revokeObjectURL(sliceUrl)
      }

      try {
        const slicedBuffer = sliceAudioBuffer(audioBufferRef.current, start, end)
        const wavBlob = audioBufferToWav(slicedBuffer)
        sliceBlobRef.current = wavBlob
        const url = URL.createObjectURL(wavBlob)
        setSliceUrl(url)
      } catch (err) {
        console.error('Failed to create slice:', err)
      }
    },
    [sliceUrl]
  )

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      playingSelectionRef.current = null
      wavesurferRef.current.playPause()
    }
  }

  const handlePlayRegion = () => {
    if (wavesurferRef.current && selectedRegion) {
      // Set the selection boundaries and start playing from beginning
      playingSelectionRef.current = { start: selectedRegion.start, end: selectedRegion.end }
      wavesurferRef.current.setTime(selectedRegion.start)
      wavesurferRef.current.play()
    }
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (!sliceUrl || !selectedRegion || !sliceBlobRef.current) return

    e.stopPropagation()

    // Create filename with time range
    const startStr = formatDuration(selectedRegion.start).replace(':', '-')
    const endStr = formatDuration(selectedRegion.end).replace(':', '-')
    const filename = `${sound.name}_${startStr}_${endStr}.wav`

    // Set DownloadURL data for drag-to-desktop/DAW
    const downloadData = `audio/wav:${filename}:${sliceUrl}`
    e.dataTransfer.setData('DownloadURL', downloadData)
    
    // Also set text/uri-list for broader compatibility
    e.dataTransfer.setData('text/uri-list', sliceUrl)
    e.dataTransfer.setData('text/plain', sliceUrl)
    
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDownloadSlice = () => {
    if (!sliceUrl || !selectedRegion) return

    const startStr = formatDuration(selectedRegion.start).replace(':', '-')
    const endStr = formatDuration(selectedRegion.end).replace(':', '-')
    const filename = `${sound.name}_${startStr}_${endStr}.wav`

    const link = document.createElement('a')
    link.href = sliceUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="sound-editor">
      <div className="sound-editor-header">
        <h2>{sound.name}</h2>
        <Button
          icon="pi pi-times"
          className="p-button-text p-button-rounded"
          onClick={onClose}
          tooltip="Close"
        />
      </div>

      <div className="sound-editor-waveform">
        {isLoading && (
          <div className="sound-editor-loading">
            <i className="pi pi-spin pi-spinner" />
            <span>Loading audio...</span>
          </div>
        )}
        <div ref={waveformRef} className="waveform-container" />
      </div>

      <div className="sound-editor-controls">
        <div className="time-display">
          <span>{formatDuration(currentTime)}</span>
          <span className="time-separator">/</span>
          <span>{formatDuration(duration)}</span>
        </div>

        <div className="playback-controls">
          <Button
            icon={`pi ${isPlaying ? 'pi-pause' : 'pi-play'}`}
            className="p-button-rounded"
            onClick={handlePlayPause}
            tooltip={isPlaying ? 'Pause' : 'Play'}
            disabled={isLoading}
          />
          <Button
            icon="pi pi-replay"
            className="p-button-rounded p-button-outlined"
            onClick={handlePlayRegion}
            tooltip="Play Selection"
            disabled={isLoading || !selectedRegion}
          />
        </div>

        <div className="selection-info">
          {selectedRegion && (
            <>
              <span className="selection-label">Selection:</span>
              <span className="selection-range">
                {formatDuration(selectedRegion.start)} -{' '}
                {formatDuration(selectedRegion.end)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="sound-editor-actions">
        <div
          className={`drag-handle ${sliceUrl ? 'active' : 'disabled'}`}
          draggable={!!sliceUrl}
          onDragStart={handleDragStart}
          onClick={handleDownloadSlice}
          title="Click to download or drag to DAW (Chrome only)"
        >
          <i className="pi pi-download" />
          <span>Export Selection (.wav)</span>
        </div>

        <div className="action-buttons">
          <Button
            label="Download Full"
            icon="pi pi-download"
            className="p-button-success"
            onClick={onDownload}
          />
        </div>
      </div>
    </div>
  )
}

export default SoundEditor
