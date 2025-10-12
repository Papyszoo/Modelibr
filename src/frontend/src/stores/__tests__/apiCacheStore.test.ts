import { renderHook, act } from '@testing-library/react'
import { useApiCacheStore } from '../apiCacheStore'
import { Model } from '../../utils/fileUtils'
import { TextureSetDto, PackDto, TextureType } from '../../types'

describe('ApiCacheStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    act(() => {
      useApiCacheStore.getState().invalidateAll()
    })
  })

  describe('Models caching', () => {
    it('should cache and retrieve models', () => {
      const mockModels: Model[] = [
        {
          id: 1,
          name: 'Test Model 1',
          originalFileName: 'model1.obj',
          fileId: 1,
          createdAt: '2024-01-01',
        },
        {
          id: 2,
          name: 'Test Model 2',
          originalFileName: 'model2.obj',
          fileId: 2,
          createdAt: '2024-01-02',
        },
      ]

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setModels(mockModels)
      })

      const cached = result.current.getModels()
      expect(cached).toEqual(mockModels)
    })

    it('should return null for stale models cache', () => {
      const mockModels: Model[] = [
        {
          id: 1,
          name: 'Test Model',
          originalFileName: 'model.obj',
          fileId: 1,
          createdAt: '2024-01-01',
        },
      ]

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setModels(mockModels)
        // Manually set timestamp to be older than TTL
        const state = useApiCacheStore.getState()
        state.models = {
          data: mockModels,
          timestamp: Date.now() - state.defaultTTL - 1000,
        }
      })

      const cached = result.current.getModels()
      expect(cached).toBeNull()
    })

    it('should cache individual models by ID', () => {
      const mockModel: Model = {
        id: 1,
        name: 'Test Model',
        originalFileName: 'model.obj',
        fileId: 1,
        createdAt: '2024-01-01',
      }

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setModelById('1', mockModel)
      })

      const cached = result.current.getModelById('1')
      expect(cached).toEqual(mockModel)
    })

    it('should invalidate models cache', () => {
      const mockModels: Model[] = [
        {
          id: 1,
          name: 'Test Model',
          originalFileName: 'model.obj',
          fileId: 1,
          createdAt: '2024-01-01',
        },
      ]

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setModels(mockModels)
      })

      expect(result.current.getModels()).toEqual(mockModels)

      act(() => {
        result.current.invalidateModels()
      })

      expect(result.current.getModels()).toBeNull()
    })
  })

  describe('Texture Sets caching', () => {
    it('should cache and retrieve texture sets', () => {
      const mockTextureSets: TextureSetDto[] = [
        {
          id: 1,
          name: 'Set 1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          textureCount: 2,
          isEmpty: false,
          textures: [
            {
              id: 1,
              textureType: TextureType.Albedo,
              fileId: 1,
              createdAt: '2024-01-01',
            },
          ],
          associatedModels: [],
        },
      ]

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setTextureSets(mockTextureSets)
      })

      const cached = result.current.getTextureSets()
      expect(cached).toEqual(mockTextureSets)
    })

    it('should cache individual texture sets by ID', () => {
      const mockTextureSet: TextureSetDto = {
        id: 1,
        name: 'Set 1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        textureCount: 1,
        isEmpty: false,
        textures: [],
        associatedModels: [],
      }

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setTextureSetById(1, mockTextureSet)
      })

      const cached = result.current.getTextureSetById(1)
      expect(cached).toEqual(mockTextureSet)
    })

    it('should invalidate texture sets cache', () => {
      const mockTextureSets: TextureSetDto[] = [
        {
          id: 1,
          name: 'Set 1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          textureCount: 0,
          isEmpty: true,
          textures: [],
          associatedModels: [],
        },
      ]

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setTextureSets(mockTextureSets)
      })

      expect(result.current.getTextureSets()).toEqual(mockTextureSets)

      act(() => {
        result.current.invalidateTextureSets()
      })

      expect(result.current.getTextureSets()).toBeNull()
    })
  })

  describe('Packs caching', () => {
    it('should cache and retrieve packs', () => {
      const mockPacks: PackDto[] = [
        {
          id: 1,
          name: 'Pack 1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          modelCount: 0,
          textureSetCount: 0,
          models: [],
          textureSets: [],
        },
      ]

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setPacks(mockPacks)
      })

      const cached = result.current.getPacks()
      expect(cached).toEqual(mockPacks)
    })

    it('should invalidate packs cache', () => {
      const mockPacks: PackDto[] = [
        {
          id: 1,
          name: 'Pack 1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          modelCount: 0,
          textureSetCount: 0,
          models: [],
          textureSets: [],
        },
      ]

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setPacks(mockPacks)
      })

      expect(result.current.getPacks()).toEqual(mockPacks)

      act(() => {
        result.current.invalidatePacks()
      })

      expect(result.current.getPacks()).toBeNull()
    })
  })

  describe('Global cache operations', () => {
    it('should invalidate all caches', () => {
      const mockModels: Model[] = [
        {
          id: 1,
          name: 'Test Model',
          originalFileName: 'model.obj',
          fileId: 1,
          createdAt: '2024-01-01',
        },
      ]
      const mockTextureSets: TextureSetDto[] = [
        {
          id: 1,
          name: 'Set 1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          textureCount: 0,
          isEmpty: true,
          textures: [],
          associatedModels: [],
        },
      ]
      const mockPacks: PackDto[] = [
        {
          id: 1,
          name: 'Pack 1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          modelCount: 0,
          textureSetCount: 0,
          models: [],
          textureSets: [],
        },
      ]

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setModels(mockModels)
        result.current.setTextureSets(mockTextureSets)
        result.current.setPacks(mockPacks)
      })

      expect(result.current.getModels()).toEqual(mockModels)
      expect(result.current.getTextureSets()).toEqual(mockTextureSets)
      expect(result.current.getPacks()).toEqual(mockPacks)

      act(() => {
        result.current.invalidateAll()
      })

      expect(result.current.getModels()).toBeNull()
      expect(result.current.getTextureSets()).toBeNull()
      expect(result.current.getPacks()).toBeNull()
    })

    it('should auto-cache individual items when setting collection', () => {
      const mockModels: Model[] = [
        {
          id: 1,
          name: 'Model 1',
          originalFileName: 'model1.obj',
          fileId: 1,
          createdAt: '2024-01-01',
        },
        {
          id: 2,
          name: 'Model 2',
          originalFileName: 'model2.obj',
          fileId: 2,
          createdAt: '2024-01-02',
        },
      ]

      const { result } = renderHook(() => useApiCacheStore())

      act(() => {
        result.current.setModels(mockModels)
      })

      // Individual models should also be cached
      expect(result.current.getModelById('1')).toEqual(mockModels[0])
      expect(result.current.getModelById('2')).toEqual(mockModels[1])
    })
  })
})
