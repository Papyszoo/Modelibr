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
    path: '/',
    component: ComponentCreator('/', 'e5f'),
    exact: true
  },
  {
    path: '/',
    component: ComponentCreator('/', 'eeb'),
    routes: [
      {
        path: '/',
        component: ComponentCreator('/', '08c'),
        routes: [
          {
            path: '/',
            component: ComponentCreator('/', '8fe'),
            routes: [
              {
                path: '/ai-documentation/BACKEND_API',
                component: ComponentCreator('/ai-documentation/BACKEND_API', 'ae0'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/ai-documentation/BLENDER_ADDON',
                component: ComponentCreator('/ai-documentation/BLENDER_ADDON', '80e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/ai-documentation/FRONTEND',
                component: ComponentCreator('/ai-documentation/FRONTEND', '8b6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/ai-documentation/MCP_TESTING_REPORT',
                component: ComponentCreator('/ai-documentation/MCP_TESTING_REPORT', '31c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/ai-documentation/TESTING',
                component: ComponentCreator('/ai-documentation/TESTING', '6c3'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/ai-documentation/WORKER',
                component: ComponentCreator('/ai-documentation/WORKER', '322'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/category/ai-documentation',
                component: ComponentCreator('/category/ai-documentation', 'd47'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/category/features',
                component: ComponentCreator('/category/features', 'ae7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/features/blender-addon',
                component: ComponentCreator('/features/blender-addon', 'f14'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/features/models',
                component: ComponentCreator('/features/models', '5a5'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/features/recycled-files',
                component: ComponentCreator('/features/recycled-files', 'c50'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/features/texture-sets',
                component: ComponentCreator('/features/texture-sets', '985'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/features/user-interface',
                component: ComponentCreator('/features/user-interface', '41a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/roadmap',
                component: ComponentCreator('/roadmap', '8cb'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/',
                component: ComponentCreator('/', 'fc9'),
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
    path: '*',
    component: ComponentCreator('*'),
  },
];
