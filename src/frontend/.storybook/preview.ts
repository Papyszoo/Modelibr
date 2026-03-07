// Import PrimeReact theme and styles
import 'primereact/resources/themes/lara-dark-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
// Import application global styles
import '../src/index.css'

import type { Preview } from '@storybook/react-vite'
import { initialize, mswLoader } from 'msw-storybook-addon'

import { handlers } from '../src/mocks/handlers'

// Initialize MSW with default handlers
initialize()

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
