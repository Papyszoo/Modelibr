/** Dispatch on window to open the global search palette from anywhere. */
export const OPEN_SEARCH_EVENT = 'modelibr:open-search'

export function openGlobalSearch(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))
}
