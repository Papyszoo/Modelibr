import {
  TOAST_LIFE_MS,
  DIALOG_WIDTH_SM,
  DIALOG_WIDTH_MD,
  DIALOG_WIDTH_LG,
  DIALOG_WIDTH_FULL,
  DIALOG_MAX_WIDTH,
  DIALOG_MAX_HEIGHT,
  SPRITE_TYPE_STATIC,
  SPRITE_TYPE_SPRITE_SHEET,
  SPRITE_TYPE_GIF,
  SPRITE_TYPE_APNG,
  SPRITE_TYPE_ANIMATED_WEBP,
} from '../constants'

describe('constants', () => {
  describe('toast constants', () => {
    it('should have correct toast life value', () => {
      expect(TOAST_LIFE_MS).toBe(3000)
    })
  })

  describe('dialog width constants', () => {
    it('should have correct small dialog width', () => {
      expect(DIALOG_WIDTH_SM).toBe('400px')
    })

    it('should have correct medium dialog width', () => {
      expect(DIALOG_WIDTH_MD).toBe('500px')
    })

    it('should have correct large dialog width', () => {
      expect(DIALOG_WIDTH_LG).toBe('600px')
    })

    it('should have correct full dialog width', () => {
      expect(DIALOG_WIDTH_FULL).toBe('80vw')
    })

    it('should have correct max dialog width', () => {
      expect(DIALOG_MAX_WIDTH).toBe('1200px')
    })

    it('should have correct max dialog height', () => {
      expect(DIALOG_MAX_HEIGHT).toBe('80vh')
    })
  })

  describe('sprite type constants', () => {
    it('should have correct sprite type values', () => {
      expect(SPRITE_TYPE_STATIC).toBe(1)
      expect(SPRITE_TYPE_SPRITE_SHEET).toBe(2)
      expect(SPRITE_TYPE_GIF).toBe(3)
      expect(SPRITE_TYPE_APNG).toBe(4)
      expect(SPRITE_TYPE_ANIMATED_WEBP).toBe(5)
    })
  })
})
