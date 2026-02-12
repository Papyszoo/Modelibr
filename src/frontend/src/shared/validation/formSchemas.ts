import { z } from 'zod'

export const textureSetNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters long')
  .max(200, 'Name cannot exceed 200 characters')

export const textureSetNameFormSchema = z.object({
  name: textureSetNameSchema,
})

export const spriteCategoryFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Category name is required').max(200),
    description: z.string().trim(),
  })
  .transform(values => ({
    name: values.name,
    description: values.description || undefined,
  }))

export const spriteRenameFormSchema = z.object({
  name: z.string().trim().max(200, 'Name cannot exceed 200 characters'),
})

const parseNumberInput = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === 'string') {
    if (!value.trim()) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

export const settingsFormSchema = z.object({
  maxFileSizeMB: z.preprocess(
    parseNumberInput,
    z
      .number({
        required_error: 'Must be at least 1 MB',
        invalid_type_error: 'Must be at least 1 MB',
      })
      .min(1, 'Must be at least 1 MB')
      .max(10240, 'Cannot exceed 10240 MB (10 GB)')
  ),
  maxThumbnailSizeMB: z.preprocess(
    parseNumberInput,
    z
      .number({
        required_error: 'Must be at least 1 MB',
        invalid_type_error: 'Must be at least 1 MB',
      })
      .min(1, 'Must be at least 1 MB')
      .max(100, 'Cannot exceed 100 MB')
  ),
  thumbnailFrameCount: z.preprocess(
    parseNumberInput,
    z
      .number({
        required_error: 'Must be at least 1 frame',
        invalid_type_error: 'Must be at least 1 frame',
      })
      .min(1, 'Must be at least 1 frame')
      .max(360, 'Cannot exceed 360 frames')
  ),
  thumbnailCameraAngle: z.preprocess(
    parseNumberInput,
    z
      .number({
        required_error: 'Cannot be negative',
        invalid_type_error: 'Cannot be negative',
      })
      .min(0, 'Cannot be negative')
      .max(2, 'Cannot exceed 2')
  ),
  thumbnailWidth: z.preprocess(
    parseNumberInput,
    z
      .number({
        required_error: 'Must be at least 64 pixels',
        invalid_type_error: 'Must be at least 64 pixels',
      })
      .min(64, 'Must be at least 64 pixels')
      .max(2048, 'Cannot exceed 2048 pixels')
  ),
  thumbnailHeight: z.preprocess(
    parseNumberInput,
    z
      .number({
        required_error: 'Must be at least 64 pixels',
        invalid_type_error: 'Must be at least 64 pixels',
      })
      .min(64, 'Must be at least 64 pixels')
      .max(2048, 'Cannot exceed 2048 pixels')
  ),
  generateThumbnailOnUpload: z.boolean(),
})

export const soundCategoryFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Category name is required'),
    description: z.string().trim(),
  })
  .transform(values => ({
    name: values.name,
    description: values.description || undefined,
  }))

export const packCreateFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Pack name is required').max(200),
    description: z.string().trim(),
  })
  .transform(values => ({
    name: values.name,
    description: values.description || undefined,
  }))

export const projectCreateFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Project name is required').max(200),
    description: z.string().trim(),
  })
  .transform(values => ({
    name: values.name,
    description: values.description || undefined,
  }))
