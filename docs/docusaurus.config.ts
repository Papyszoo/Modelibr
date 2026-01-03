import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Modelibr',
  tagline: 'Self-hosted 3D Model Library',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  // Set in deployment - placeholder for now
  url: 'https://modelibr.com',
  baseUrl: '/',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/', // Docs at root
        },
        blog: false, // Disable blog
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/screenshots/model-viewer.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Modelibr',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: '/ai-documentation/BACKEND_API',
          label: 'AI Docs',
          position: 'left',
        },
        {
          href: 'https://github.com/your-org/modelibr', // TODO: Update
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/',
            },
            {
              label: 'Features',
              to: '/category/features',
            },
          ],
        },
        {
          title: 'AI Documentation',
          items: [
            {
              label: 'Backend API',
              href: '/ai-documentation/BACKEND_API',
            },
            {
              label: 'Frontend',
              href: '/ai-documentation/FRONTEND',
            },
            {
              label: 'Worker',
              href: '/ai-documentation/WORKER',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Modelibr. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
