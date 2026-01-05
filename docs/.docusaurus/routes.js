import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/__docusaurus/debug',
    component: ComponentCreator('/__docusaurus/debug', '5ff'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/config',
    component: ComponentCreator('/__docusaurus/debug/config', '5ba'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/content',
    component: ComponentCreator('/__docusaurus/debug/content', 'a2b'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/globalData',
    component: ComponentCreator('/__docusaurus/debug/globalData', 'c3c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/metadata',
    component: ComponentCreator('/__docusaurus/debug/metadata', '156'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/registry',
    component: ComponentCreator('/__docusaurus/debug/registry', '88c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/routes',
    component: ComponentCreator('/__docusaurus/debug/routes', '000'),
    exact: true
  },
  {
    path: '/markdown-page',
    component: ComponentCreator('/markdown-page', '3d7'),
    exact: true
  },
  {
    path: '/docs',
    component: ComponentCreator('/docs', '303'),
    routes: [
      {
        path: '/docs',
        component: ComponentCreator('/docs', 'cd1'),
        routes: [
          {
            path: '/docs',
            component: ComponentCreator('/docs', '70d'),
            routes: [
              {
                path: '/docs/',
                component: ComponentCreator('/docs/', '698'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/ai-documentation/API_CONTRACTS',
                component: ComponentCreator('/docs/ai-documentation/API_CONTRACTS', '88a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/ai-documentation/BACKEND_API',
                component: ComponentCreator('/docs/ai-documentation/BACKEND_API', 'd46'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/ai-documentation/BLENDER_ADDON',
                component: ComponentCreator('/docs/ai-documentation/BLENDER_ADDON', 'd24'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/ai-documentation/FRONTEND',
                component: ComponentCreator('/docs/ai-documentation/FRONTEND', '145'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/ai-documentation/MCP_TESTING_REPORT',
                component: ComponentCreator('/docs/ai-documentation/MCP_TESTING_REPORT', 'b0a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/ai-documentation/TESTING',
                component: ComponentCreator('/docs/ai-documentation/TESTING', '8d5'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/ai-documentation/TEXTURE_CHANNEL_MAPPING',
                component: ComponentCreator('/docs/ai-documentation/TEXTURE_CHANNEL_MAPPING', 'af4'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/ai-documentation/WORKER',
                component: ComponentCreator('/docs/ai-documentation/WORKER', '64c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/category/ai-documentation',
                component: ComponentCreator('/docs/category/ai-documentation', 'fee'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/category/features',
                component: ComponentCreator('/docs/category/features', 'ff0'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/changelog',
                component: ComponentCreator('/docs/changelog', 'a62'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/features/blender-addon',
                component: ComponentCreator('/docs/features/blender-addon', '2ad'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/features/models',
                component: ComponentCreator('/docs/features/models', '27f'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/features/recycled-files',
                component: ComponentCreator('/docs/features/recycled-files', 'e5c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/features/texture-sets',
                component: ComponentCreator('/docs/features/texture-sets', 'fff'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/features/user-interface',
                component: ComponentCreator('/docs/features/user-interface', '6a9'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/roadmap',
                component: ComponentCreator('/docs/roadmap', 'ced'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/',
    component: ComponentCreator('/', 'e5f'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
