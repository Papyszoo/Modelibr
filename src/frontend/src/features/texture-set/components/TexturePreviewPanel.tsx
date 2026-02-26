import { Suspense, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stage, OrbitControls } from '@react-three/drei'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TextureSetDto, TextureSetKind } from '@/types'
import { TexturedGeometry, TextureLoadingState, TextureStrengths } from './TexturedGeometry'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { FloatingWindow } from '@/components/FloatingWindow'
import { PreviewInfo } from './PreviewInfo'
import { PreviewSettings, PreviewSettingsType } from './PreviewSettings'
import {
  updateTilingScale,
  regenerateTextureSetThumbnail,
} from '@/features/texture-set/api/textureSetApi'
import { Button } from 'primereact/button'
import { ProgressBar } from 'primereact/progressbar'
import './TexturePreviewPanel.css'

interface TexturePreviewPanelProps {
  textureSet: TextureSetDto
  side?: 'left' | 'right'
  textureQuality: number
}

export function TexturePreviewPanel({
  textureSet,
  side = 'left',
  textureQuality,
}: TexturePreviewPanelProps) {
  const isUniversal = textureSet.kind === TextureSetKind.Universal

  const [infoWindowVisible, setInfoWindowVisible] = useState<boolean>(false)
  const [settingsWindowVisible, setSettingsWindowVisible] =
    useState<boolean>(false)
  const [disabledTextures, setDisabledTextures] = useState<Set<string>>(new Set())
  const [textureStrengths, setTextureStrengths] = useState<TextureStrengths>({})
  const [previewSettings, setPreviewSettings] = useState<PreviewSettingsType>({
    type: isUniversal ? 'plane' : 'box',
    scale: 1,
    wireframe: false,
    cubeSize: 2,
    sphereRadius: 1.2,
    sphereSegments: 64,
    cylinderRadius: 1,
    cylinderHeight: 2,
    torusRadius: 1,
    torusTube: 0.4,
    uvScale: textureSet.uvScale ?? 1,
    textureQuality: 0, // kept in type for compat but controlled via prop
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

  // Regenerate thumbnail with current live preview settings
  const regenerateThumbnailMutation = useMutation({
    mutationFn: () =>
      regenerateTextureSetThumbnail(textureSet.id, {
        uvScale: previewSettings.uvScale,
        geometryType: previewSettings.type,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textureSets'] })
    },
  })

  // Generate proxies at a specific size — handled by TextureSetViewer now

  // Toggle texture visibility in preview
  const handleToggleTexture = useCallback((textureType: string) => {
    setDisabledTextures(prev => {
      const next = new Set(prev)
      if (next.has(textureType)) {
        next.delete(textureType)
      } else {
        next.add(textureType)
      }
      return next
    })
  }, [])

  // Update per-texture strength
  const handleStrengthChange = useCallback(
    (textureType: string, value: number) => {
      setTextureStrengths(prev => ({ ...prev, [textureType]: value }))
    },
    []
  )

  // Texture loading progress state
  const [textureLoading, setTextureLoading] = useState<TextureLoadingState>({
    isLoading: true,
    loaded: 0,
    total: 0,
  })

  const handleLoadingChange = useCallback((state: TextureLoadingState) => {
    setTextureLoading(state)
  }, [])

  const loadingPercent =
    textureLoading.total > 0
      ? Math.round((textureLoading.loaded / textureLoading.total) * 100)
      : 0

  // Combine settings for geometry params — memoised to avoid unnecessary re-renders
  const geometryParams = useMemo(() => ({
    type: previewSettings.type,
    scale: previewSettings.scale,
    wireframe: previewSettings.wireframe,
    cubeSize: previewSettings.cubeSize,
    sphereRadius: previewSettings.sphereRadius,
    sphereSegments: previewSettings.sphereSegments,
    cylinderRadius: previewSettings.cylinderRadius,
    cylinderHeight: previewSettings.cylinderHeight,
    torusRadius: previewSettings.torusRadius,
    torusTube: previewSettings.torusTube,
    uvScale: previewSettings.uvScale,
  }), [previewSettings])

  return (
    <div className="texture-preview-panel">
      <div className="preview-canvas-container">
        {/* Floating control buttons */}
        <div className="preview-controls preview-controls-right">
          {isUniversal && (
            <Button
              icon={`pi ${regenerateThumbnailMutation.isPending ? 'pi-spin pi-spinner' : 'pi-refresh'}`}
              className="p-button-rounded preview-control-btn"
              onClick={() => regenerateThumbnailMutation.mutate()}
              disabled={regenerateThumbnailMutation.isPending}
              tooltip="Regenerate Thumbnail"
              tooltipOptions={{ position: 'left' }}
            />
          )}
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

        {/* Loading overlay */}
        {textureLoading.isLoading && (
          <div className="texture-loading-overlay">
            <div className="texture-loading-content">
              <i className="pi pi-spinner pi-spin texture-loading-icon" />
              <span className="texture-loading-text">
                Loading textures ({textureLoading.loaded}/{textureLoading.total})
              </span>
              <ProgressBar
                value={loadingPercent}
                showValue={false}
                className="texture-loading-progress"
              />
            </div>
          </div>
        )}

        <Canvas
          shadows
          className="texture-preview-canvas"
          camera={{ position: [3, 2, 3], fov: 45 }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
          }}
          dpr={Math.min(window.devicePixelRatio, 2)}
        >
          {/* Stage provides automatic lighting, shadows, and camera positioning */}
          <Stage intensity={0.5} environment="city" adjustCamera={false}>
            <Suspense fallback={<LoadingPlaceholder />}>
              <TexturedGeometry
                geometryType={previewSettings.type}
                textureSet={textureSet}
                geometryParams={geometryParams}
                disabledTextures={disabledTextures}
                textureStrengths={textureStrengths}
                onLoadingChange={handleLoadingChange}
                textureQuality={textureQuality}
              />
            </Suspense>
          </Stage>

          {/* Controls */}
          <OrbitControls
            makeDefault
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
          isGlobalMaterial={isUniversal}
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
          disabledTextures={disabledTextures}
          textureStrengths={textureStrengths}
          onToggleTexture={handleToggleTexture}
          onStrengthChange={handleStrengthChange}
        />
      </FloatingWindow>
    </div>
  )
}
