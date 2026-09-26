import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import { type ReactElement, type ReactNode } from 'react'

import { TabContext, type TabContextValue } from '@/contexts/TabContext'

/**
 * Shared test harness for component-flow tests. Wraps the UI in a fresh React
 * Query client (retries off, no caching between tests) so a test can drive a
 * real component against the globally-mocked `@/lib/apiBase` and assert on the
 * rendered result + the requests it fired - i.e. real scenarios, not snapshots.
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
 * Wrapper component for `renderHook` - gives a hook a real React Query client so
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
  /**
   * A tab id to expose, when the component under test reaches for the tab
   * system. Opt-in rather than always-on because most component tests have no
   * tab at all, and a provider they do not need is scaffolding in every file.
   */
  tabId?: string
  /** Records what the component asked the tab system to do. */
  onOpenSceneEditorTab?: (sceneId: string, name?: string) => void
}

export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    tabId,
    onOpenSceneEditorTab,
    ...options
  }: ProvidersOptions = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    const inner = (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    if (tabId === undefined) {
      return inner
    }
    return (
      <TabContext.Provider
        value={createTestTabContext(tabId, onOpenSceneEditorTab)}
      >
        {inner}
      </TabContext.Provider>
    )
  }
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) }
}

/**
 * A tab context for tests, permissive where the real one is strict.
 *
 * `useTabContext` throws outside a provider on purpose, so a component that needs
 * it fails loudly in a test rather than silently doing nothing. This gives those
 * components a context without the ceremony of sixteen members, and it records
 * the navigation calls so a test can assert that a scene was opened rather than
 * only that a button was pressed.
 */
export function createTestTabContext(
  tabId: string,
  onOpenSceneEditorTab: (sceneId: string, name?: string) => void = () =>
    undefined
): TabContextValue {
  const noop = (): void => undefined
  return {
    side: 'left',
    tabs: [],
    setTabs: noop,
    activeTab: tabId,
    setActiveTab: noop,
    openModelDetailsTab: noop,
    openTextureSetDetailsTab: noop,
    openEnvironmentMapDetailsTab: noop,
    openPackDetailsTab: noop,
    openProjectDetailsTab: noop,
    openScriptDetailsTab: noop,
    openSceneEditorTab: onOpenSceneEditorTab,
    openScenesList: noop,
    relabelTab: noop,
    openTab: noop,
    tabId,
    closeTab: noop,
  }
}
