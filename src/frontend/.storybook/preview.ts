// Import PrimeReact core styles (the theme stylesheet itself is managed
// dynamically - see applyTheme below).
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
// Import application design tokens + global styles
import '../src/shared/styles/tokens.css'
import '../src/index.css'

import type { Preview } from '@storybook/react-vite'
import { initialize, mswLoader } from 'msw-storybook-addon'
// The ?url suffix tells Vite to return the URL to the file instead of its
// contents - same mechanism the app's useTheme hook uses to swap themes.
import darkTheme from 'primereact/resources/themes/lara-dark-blue/theme.css?url'
import lightTheme from 'primereact/resources/themes/lara-light-blue/theme.css?url'

import { handlers } from '../src/mocks/handlers'

const THEME_LINK_ID = 'storybook-primereact-theme'

/**
 * Swap the PrimeReact Lara theme exactly like the app does (managed <link>
 * + color-scheme), so every story can be viewed in light and dark via the
 * toolbar. Story-level `globals: { theme: 'light' }` pins a story to a mode.
 */
function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.style.colorScheme = theme

  let link = document.getElementById(THEME_LINK_ID) as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = THEME_LINK_ID
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }

  const href = theme === 'dark' ? darkTheme : lightTheme
  if (!link.href.endsWith(href)) {
    link.href = href
  }

  // The story canvas tracks the theme's surfaces instead of a hardcoded
  // backgrounds-addon color.
  document.body.style.background = 'var(--surface-ground)'
  document.body.style.color = 'var(--text-color)'

  // index.css locks html/body to overflow:hidden for the app's fixed
  // tab-shell viewport; stories (e.g. the design-system gallery) are
  // documents and must scroll.
  document.documentElement.style.overflow = 'auto'
  document.body.style.overflow = 'auto'
}

// Initialize MSW with default handlers.
// Use a relative worker URL so registration works both in dev (Storybook served
// at the origin root) and on the GitHub Pages deploy, where Storybook lives
// under the `/Modelibr/storybook/` sub-path. MSW resolves this against the
// iframe's location, so the worker is found at whatever base Storybook is served
// from - the default absolute `/mockServiceWorker.js` 404s under the sub-path.
initialize({
  serviceWorker: {
    url: 'mockServiceWorker.js',
  },
})

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    msw: {
      handlers,
    },
  },
  globalTypes: {
    theme: {
      description: 'PrimeReact Lara theme',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'dark', icon: 'moon', title: 'Dark' },
          { value: 'light', icon: 'sun', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'dark',
  },
  decorators: [
    (Story, context) => {
      applyTheme(context.globals.theme === 'light' ? 'light' : 'dark')
      return Story()
    },
  ],
  loaders: [mswLoader],
}

export default preview
