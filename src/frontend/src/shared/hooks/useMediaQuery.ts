import { useEffect, useState } from 'react'

import { mediaQuery, type MediaQueryName } from '@/shared/styles/breakpoints'

/**
 * Subscribe to a media query and re-render when it changes.
 *
 *   const isMobile = useMediaQuery('(max-width: 767px)')
 *   const isMobile = useMediaQuery(mediaQuery.isMobile)
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

/**
 * Convenience wrapper around named breakpoints from `breakpoints.ts`.
 *
 *   const isMobile = useBreakpoint('isMobile')
 */
export function useBreakpoint(name: MediaQueryName): boolean {
  return useMediaQuery(mediaQuery[name])
}

export const useIsMobile = () => useBreakpoint('isMobile')
export const useIsTablet = () => useBreakpoint('isTablet')
export const useIsDesktop = () => useBreakpoint('isDesktop')
