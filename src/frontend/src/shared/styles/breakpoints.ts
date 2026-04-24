/**
 * Responsive breakpoints. Single source of truth — keep in sync with
 * the `--mod-bp-*` documentation values in `tokens.css`.
 *
 * Values are in pixels and represent the *minimum* width at which a
 * range begins. `mobile` covers everything below `tablet`.
 */
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

/**
 * Pre-built media query strings for use with `useMediaQuery` or in
 * libraries that accept query strings (e.g. matchMedia).
 *
 *   `isMobile`  → screen width < 768px
 *   `isTablet`  → 768px ≤ width < 1024px
 *   `isDesktop` → width ≥ 1024px (covers wide too)
 *   `tabletUp`  → width ≥ 768px
 *   `desktopUp` → width ≥ 1024px
 */
export const mediaQuery = {
  isMobile: `(max-width: ${BREAKPOINTS.tablet - 1}px)`,
  isTablet: `(min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${BREAKPOINTS.desktop - 1}px)`,
  isDesktop: `(min-width: ${BREAKPOINTS.desktop}px)`,
  tabletUp: `(min-width: ${BREAKPOINTS.tablet}px)`,
  desktopUp: `(min-width: ${BREAKPOINTS.desktop}px)`,
  wideUp: `(min-width: ${BREAKPOINTS.wide}px)`,
} as const

export type MediaQueryName = keyof typeof mediaQuery
