import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import { type ReactElement, type ReactNode } from 'react'

/**
 * Shared test harness for component-flow tests. Wraps the UI in a fresh React
 * Query client (retries off, no caching between tests) so a test can drive a
 * real component against the globally-mocked `@/lib/apiBase` and assert on the
 * rendered result + the requests it fired — i.e. real scenarios, not snapshots.
 *
 * Add more providers here (theme, tab context, …) as flow tests need them, so
 * individual tests stay focused on behaviour rather than scaffolding.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

/**
 * Wrapper component for `renderHook` — gives a hook a real React Query client so
 * its query/mutation behaviour (pagination, cache keys, refetch) can be driven
 * and asserted. Create the client once per test (in beforeEach) so cache state
 * doesn't leak between cases.
 */
export function createQueryWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

interface ProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
}

export function renderWithProviders(
  ui: ReactElement,
  { queryClient = createTestQueryClient(), ...options }: ProvidersOptions = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) }
}
