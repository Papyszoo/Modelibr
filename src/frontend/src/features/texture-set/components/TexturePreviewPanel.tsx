import { Suspense, useState, useCallback, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stage, OrbitControls } from '@react-three/drei'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TextureSetDto, TextureSetKind } from '@/types'
import { TexturedGeometry } from './TexturedGeometry'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { FloatingWindow } from '@/components/FloatingWindow'
import { PreviewInfo } from './PreviewInfo'
import { PreviewSettings, PreviewSettingsType } from './PreviewSettings'
import { updateTilingScale } from '@/features/texture-set/api/textureSetApi'
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
  const isUniversal = textureSet.kind === TextureSetKind.Universal

  const [infoWindowVisible, setInfoWindowVisible] = useState<boolean>(false)
  const [settingsWindowVisible, setSettingsWindowVisible] =
    useState<boolean>(false)
  const [previewSettings, setPreviewSettings] = useState<PreviewSettingsType>({
    type: isUniversal ? 'sphere' : 'box',
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
    uvScale: textureSet.uvScale ?? 1,
  })

  // Auto-save tiling scale for Universal sets (debounced)
  const queryClient = useQueryClient()
  const tilingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveTilingMutation = useMutation({
    mutationFn: ({
      uvScale,
    }: {
      uvScale: number
    }) =>
      updateTilingScale(textureSet.id, {
        tilingScaleX: uvScale,
        tilingScaleY: uvScale,
        uvScale,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textureSets'] })
    },
  })

  const handleSettingsChange = useCallback(
    (newSettings: PreviewSettingsType) => {
      setPreviewSettings(newSettings)

      // Auto-save UV scale changes for Universal sets (debounced 1s)
      if (isUniversal) {
        const tilingChanged =
          newSettings.uvScale !== previewSettings.uvScale
        if (tilingChanged) {
          if (tilingDebounceRef.current) clearTimeout(tilingDebounceRef.current)
          tilingDebounceRef.current = setTimeout(() => {
            saveTilingMutation.mutate({
              uvScale: newSettings.uvScale,
            })
          }, 1000)
        }
      }
    },
    [isUniversal, previewSettings, saveTilingMutation]
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (tilingDebounceRef.current) clearTimeout(tilingDebounceRef.current)
    }
  }, [])

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
    uvScale: previewSettings.uvScale,
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
          onSettingsChange={handleSettingsChange}
          showTilingControls={isUniversal}
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
