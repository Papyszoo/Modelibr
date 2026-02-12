import { QueryClient, DefaultOptions } from '@tanstack/react-query'
import type { UseQueryOptions } from '@tanstack/react-query'

const queryConfig: DefaultOptions = {
  queries: {
    staleTime: 5 * 60 * 1000, // 5 minutes — matches previous apiCacheStore TTL
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
}

export const queryClient = new QueryClient({ defaultOptions: queryConfig })

// Utility type for overriding query config in hooks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryConfig<T extends (...args: any[]) => any> = Omit<
  ReturnType<T>,
  'queryKey' | 'queryFn'
>

// Re-export commonly used types for convenience
export type { UseQueryOptions }
