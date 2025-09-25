import { useState } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { ProgressBar } from 'primereact/progressbar'
import './AnimationList.css'

// Placeholder data for animations
const PLACEHOLDER_ANIMATIONS = [
  {
    id: 1,
    name: 'Walk_Cycle.fbx',
    duration: '2.5s',
    fps: 30,
    frames: 75,
    size: '1.2 MB',
  },
  {
    id: 2,
    name: 'Idle_Animation.glb',
    duration: '5.0s',
    fps: 24,
    frames: 120,
    size: '850 KB',
  },
  {
    id: 3,
    name: 'Jump_Sequence.bvh',
    duration: '1.8s',
    fps: 60,
    frames: 108,
    size: '540 KB',
  },
  {
    id: 4,
    name: 'Dance_Motion.dae',
    duration: '15.2s',
    fps: 30,
    frames: 456,
    size: '3.1 MB',
  },
]

function AnimationList() {
  const [animations] = useState(PLACEHOLDER_ANIMATIONS)
  const [selectedAnimation, setSelectedAnimation] = useState(null)
  const [playingAnimation, setPlayingAnimation] = useState(null)

  const actionBodyTemplate = rowData => {
    const isPlaying = playingAnimation === rowData.id

    return (
      <div className="animation-actions">
        <Button
          icon={isPlaying ? 'pi pi-pause' : 'pi pi-play'}
          className="p-button-text p-button-rounded"
          onClick={() => handlePlayPause(rowData)}
          tooltip={isPlaying ? 'Pause Animation' : 'Play Animation'}
        />
        <Button
          icon="pi pi-eye"
          className="p-button-text p-button-rounded"
          onClick={() => setSelectedAnimation(rowData)}
          tooltip="View Details"
        />
        <Button
          icon="pi pi-download"
          className="p-button-text p-button-rounded"
          onClick={() => console.log('Download animation:', rowData.id)}
          tooltip="Download Animation"
        />
      </div>
    )
  }

  const handlePlayPause = animation => {
    if (playingAnimation === animation.id) {
      setPlayingAnimation(null)
    } else {
      setPlayingAnimation(animation.id)
      // Simulate animation playback
      setTimeout(
        () => {
          setPlayingAnimation(null)
        },
        parseFloat(animation.duration) * 1000
      )
    }
  }

  const durationBodyTemplate = rowData => {
    return (
      <span className="animation-duration">
        <i className="pi pi-clock"></i>
        {rowData.duration}
      </span>
    )
  }

  const framesBodyTemplate = rowData => {
    return (
      <span className="animation-frames">
        {rowData.frames} @ {rowData.fps}fps
      </span>
    )
  }

  return (
    <div className="animation-list">
      <header className="animation-list-header">
        <h1>Animation Library</h1>
        <div className="animation-stats">
          <span className="stat-item">
            <i className="pi pi-play"></i>
            {animations.length} animations
          </span>
          <span className="stat-item">
            <i className="pi pi-clock"></i>
            {animations
              .reduce((total, anim) => total + parseFloat(anim.duration), 0)
              .toFixed(1)}
            s total
          </span>
        </div>
      </header>

      <div className="animation-list-content">
        <DataTable
          value={animations}
          selection={selectedAnimation}
          onSelectionChange={e => setSelectedAnimation(e.value)}
          selectionMode="single"
          responsiveLayout="scroll"
          stripedRows
          showGridlines
          emptyMessage="No animations found"
        >
          <Column field="name" header="Name" sortable />
          <Column
            field="duration"
            header="Duration"
            body={durationBodyTemplate}
            sortable
          />
          <Column field="frames" header="Frames" body={framesBodyTemplate} />
          <Column field="size" header="Size" sortable />
          <Column
            body={actionBodyTemplate}
            header="Actions"
            style={{ width: '150px' }}
          />
        </DataTable>
      </div>

      {selectedAnimation && (
        <div className="animation-preview">
          <h3>Preview: {selectedAnimation.name}</h3>
          <div className="animation-details">
            <div className="detail-row">
              <span className="label">Duration:</span>
              <span className="value">{selectedAnimation.duration}</span>
            </div>
            <div className="detail-row">
              <span className="label">Frames:</span>
              <span className="value">
                {selectedAnimation.frames} @ {selectedAnimation.fps}fps
              </span>
            </div>
            <div className="detail-row">
              <span className="label">File Size:</span>
              <span className="value">{selectedAnimation.size}</span>
            </div>
          </div>

          {playingAnimation === selectedAnimation.id && (
            <div className="animation-progress">
              <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
              <p>Playing animation...</p>
            </div>
          )}

          <div className="animation-placeholder">
            <i
              className="pi pi-play"
              style={{ fontSize: '4rem', color: '#9ca3af' }}
            ></i>
            <p>Animation preview would be displayed here</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnimationList
