import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { type TextureSetDto, type TextureType } from '@/types'
import { getRegularTypes } from '@/utils/textureTypeUtils'

import { HeightCard } from './HeightCard'
import { SurfaceCard } from './SurfaceCard'
import { TextureCard } from './TextureCard'

interface TextureTypesTabProps {
  textureSet: TextureSetDto
  onTextureUpdated: () => void
  side?: 'left' | 'right'
}

export function TextureTypesTab({
  textureSet,
  onTextureUpdated,
  side = 'left',
}: TextureTypesTabProps) {
  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidthKey =
    side === 'right' ? 'textureSetViewerRight' : 'textureSetViewerLeft'
  const cardWidth = settings[cardWidthKey]
  const regularTypes = getRegularTypes()

  return (
    <>
      <div
        style={{
          padding: '1rem',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <CardWidthSlider
          value={cardWidth}
          min={200}
          max={500}
          onChange={width => setCardWidth(cardWidthKey, width)}
        />
      </div>
      <div
        className="texture-cards-grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
        }}
      >
        {regularTypes.map((textureType: TextureType) => {
          const texture =
            textureSet.textures.find(t => t.textureType === textureType) || null

          return (
            <TextureCard
              key={textureType}
              textureType={textureType}
              texture={texture}
              setId={textureSet.id}
              onTextureUpdated={onTextureUpdated}
            />
          )
        })}

        <SurfaceCard
          textures={textureSet.textures}
          setId={textureSet.id}
          onTextureUpdated={onTextureUpdated}
        />

        <HeightCard
          textures={textureSet.textures}
          setId={textureSet.id}
          onTextureUpdated={onTextureUpdated}
        />
      </div>
    </>
  )
}
