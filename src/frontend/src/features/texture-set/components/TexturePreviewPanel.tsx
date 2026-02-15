import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stage, OrbitControls } from '@react-three/drei'
import { TextureSetDto } from '@/types'
import { TexturedGeometry } from './TexturedGeometry'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { FloatingWindow } from '@/components/FloatingWindow'
import { PreviewInfo } from './PreviewInfo'
import { PreviewSettings, PreviewSettingsType } from './PreviewSettings'
import { Button } from 'primereact/button'
import './TexturePreviewPanel.css'

interface TexturePreviewPanelProps {
  textureSet: TextureSetDto
  side?: 'left' | 'right'
}

export function TexturePreviewPanel({
  textureSet,
  side = 'left',
}: TexturePreviewPanelProps) {
  const [infoWindowVisible, setInfoWindowVisible] = useState<boolean>(false)
  const [settingsWindowVisible, setSettingsWindowVisible] =
    useState<boolean>(false)
  const [previewSettings, setPreviewSettings] = useState<PreviewSettingsType>({
    type: 'box',
    scale: 1,
    rotationSpeed: 0.01,
    wireframe: false,
    cubeSize: 2,
    sphereRadius: 1.2,
    sphereSegments: 64,
    cylinderRadius: 1,
    cylinderHeight: 2,
    torusRadius: 1,
    torusTube: 0.4,
  })

  // Combine settings for geometry params
  const geometryParams = {
    type: previewSettings.type,
    scale: previewSettings.scale,
    rotationSpeed: previewSettings.rotationSpeed,
    wireframe: previewSettings.wireframe,
    cubeSize: previewSettings.cubeSize,
    sphereRadius: previewSettings.sphereRadius,
    sphereSegments: previewSettings.sphereSegments,
    cylinderRadius: previewSettings.cylinderRadius,
    cylinderHeight: previewSettings.cylinderHeight,
    torusRadius: previewSettings.torusRadius,
    torusTube: previewSettings.torusTube,
  }

  return (
    <div className="texture-preview-panel">
      <div className="preview-canvas-container">
        {/* Floating control buttons */}
        <div className="preview-controls preview-controls-right">
          <Button
            icon="pi pi-cog"
            className="p-button-rounded preview-control-btn"
            onClick={() => setSettingsWindowVisible(!settingsWindowVisible)}
            tooltip="Preview Settings"
            tooltipOptions={{ position: 'left' }}
          />
          <Button
            icon="pi pi-info-circle"
            className="p-button-rounded preview-control-btn"
            onClick={() => setInfoWindowVisible(!infoWindowVisible)}
            tooltip="Preview Information"
            tooltipOptions={{ position: 'left' }}
          />
        </div>

        <Canvas
          shadows
          className="texture-preview-canvas"
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
          }}
          dpr={Math.min(window.devicePixelRatio, 2)}
        >
          {/* Stage provides automatic lighting, shadows, and camera positioning */}
          <Stage intensity={0.5} environment="city" adjustCamera={2.5}>
            <Suspense fallback={<LoadingPlaceholder />}>
              <TexturedGeometry
                geometryType={previewSettings.type}
                textureSet={textureSet}
                geometryParams={geometryParams}
              />
            </Suspense>
          </Stage>

          {/* Controls */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            maxDistance={50}
            minDistance={0.1}
          />
        </Canvas>
      </div>

      {/* Floating Windows */}
      <FloatingWindow
        visible={settingsWindowVisible}
        onClose={() => setSettingsWindowVisible(false)}
        title="Preview Settings"
        side={side}
        windowId="preview-settings"
      >
        <PreviewSettings
          settings={previewSettings}
          onSettingsChange={setPreviewSettings}
        />
      </FloatingWindow>
      <FloatingWindow
        visible={infoWindowVisible}
        onClose={() => setInfoWindowVisible(false)}
        title="Preview Information"
        side={side}
        windowId="preview-info"
      >
        <PreviewInfo
          textureSet={textureSet}
          geometryType={previewSettings.type}
        />
      </FloatingWindow>
    </div>
  )
}

