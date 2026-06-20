import { type HierarchicalCategory } from '@/shared/types/categories'

export interface ScriptDto {
  id: number
  name: string
  fileId: number
  categoryId: number | null
  categoryName: string | null
  language: string
  lineCount: number
  fileName: string
  fileSizeBytes: number
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface GetAllScriptsResponse {
  scripts: ScriptDto[]
}

export type ScriptCategoryDto = HierarchicalCategory

export interface GetAllScriptCategoriesResponse {
  categories: ScriptCategoryDto[]
}

export interface ScriptTemplateDto {
  /** "builtin:<key>" for shipped templates, or the numeric DB id for custom ones. */
  id: string
  name: string
  language: string
  description: string | null
  content: string
  isBuiltIn: boolean
}

export interface GetAllScriptTemplatesResponse {
  templates: ScriptTemplateDto[]
}

export interface GetAllScriptsResponsePaginated extends GetAllScriptsResponse {
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}
