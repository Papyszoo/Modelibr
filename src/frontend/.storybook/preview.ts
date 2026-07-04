// Import PrimeReact theme and styles
import 'primereact/resources/themes/lara-dark-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
// Import application design tokens + global styles
import '../src/shared/styles/tokens.css'
import '../src/index.css'

import type { Preview } from '@storybook/react-vite'
import { initialize, mswLoader } from 'msw-storybook-addon'

import { handlers } from '../src/mocks/handlers'

// Initialize MSW with default handlers.
// Use a relative worker URL so registration works both in dev (Storybook served
// at the origin root) and on the GitHub Pages deploy, where Storybook lives
// under the `/Modelibr/storybook/` sub-path. MSW resolves this against the
// iframe's location, so the worker is found at whatever base Storybook is served
// from — the default absolute `/mockServiceWorker.js` 404s under the sub-path.
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
    backgrounds: {
      default: 'dark',
      values: [
        {
          name: 'dark',
          value: '#242424',
        },
        {
          name: 'light',
          value: '#ffffff',
        },
      ],
    },
    msw: {
      handlers,
    },
  },
  loaders: [mswLoader],
}

export default preview
