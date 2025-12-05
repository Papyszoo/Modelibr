import { useEffect } from 'react'
import { useThemeStore, Theme } from '../stores/themeStore'

const THEME_LINK_ID = 'primereact-theme-link'

// Import theme CSS files - Vite will handle bundling
// The ?url suffix tells Vite to return the URL to the file instead of its contents
import lightTheme from 'primereact/resources/themes/lara-light-blue/theme.css?url'
import darkTheme from 'primereact/resources/themes/lara-dark-blue/theme.css?url'

const getThemeUrl = (theme: Theme): string => {
  return theme === 'dark' ? darkTheme : lightTheme
}

export const useTheme = () => {
  const { theme, setTheme } = useThemeStore()

  useEffect(() => {
    // Find or create the theme link element
    let themeLink = document.getElementById(
      THEME_LINK_ID
    ) as HTMLLinkElement | null

    if (!themeLink) {
      // If it doesn't exist, try to find the existing PrimeReact theme link
      const existingLinks = document.querySelectorAll(
        'link[href*="primereact/resources/themes"]'
      )
      if (existingLinks.length > 0) {
        themeLink = existingLinks[0] as HTMLLinkElement
        themeLink.id = THEME_LINK_ID
      } else {
        // Create a new link element
        themeLink = document.createElement('link')
        themeLink.id = THEME_LINK_ID
        themeLink.rel = 'stylesheet'
        themeLink.type = 'text/css'
        document.head.appendChild(themeLink)
      }
    }

    // Update the href to the new theme
    const newHref = getThemeUrl(theme)
    // Normalize URLs for comparison by converting to absolute paths
    const currentHref = new URL(themeLink.href, window.location.origin).href
    const targetHref = new URL(newHref, window.location.origin).href

    if (currentHref !== targetHref) {
      themeLink.href = newHref
    }
  }, [theme])

  return { theme, setTheme }
}
