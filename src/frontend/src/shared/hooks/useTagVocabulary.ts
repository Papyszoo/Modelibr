import { useQuery } from '@tanstack/react-query'

import { client } from '@/lib/apiBase'

interface TagVocabularyResponse {
  tags: { name: string }[]
}

/**
 * The shared tag vocabulary — the single ModelTag pool drawn from by every
 * asset type. Backed by the `/model-tags` endpoint (the canonical tag list).
 */
export function useTagVocabulary() {
  return useQuery({
    queryKey: ['tag-vocabulary'],
    queryFn: async (): Promise<string[]> => {
      const response = await client.get<TagVocabularyResponse>('/model-tags')
      return (response.data.tags ?? []).map(tag => tag.name)
    },
    staleTime: 60_000,
  })
}
