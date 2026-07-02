import { useQuery } from '@tanstack/react-query'

import { client } from '@/lib/apiBase'

interface TagVocabularyResponse {
  tags: { name: string }[]
}

/**
 * Which asset type's tag vocabulary to load. Tags are strictly per-asset-type —
 * models and texture sets draw suggestions from separate pools, never a shared
 * one — so the source is explicit.
 */
export type TagVocabularySource = 'model' | 'texture-set'

const ENDPOINT_BY_SOURCE: Record<TagVocabularySource, string> = {
  model: '/model-tags',
  'texture-set': '/texture-sets/tags',
}

/**
 * The tag vocabulary for a single asset type, used to power tag autocomplete.
 */
export function useTagVocabulary(source: TagVocabularySource = 'model') {
  return useQuery({
    queryKey: ['tag-vocabulary', source],
    queryFn: async (): Promise<string[]> => {
      const response = await client.get<TagVocabularyResponse>(
        ENDPOINT_BY_SOURCE[source]
      )
      return (response.data.tags ?? []).map(tag => tag.name)
    },
    staleTime: 60_000,
  })
}
