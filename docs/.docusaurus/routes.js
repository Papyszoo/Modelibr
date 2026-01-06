import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/Modelibr/__docusaurus/debug',
    component: ComponentCreator('/Modelibr/__docusaurus/debug', '635'),
    exact: true
  },
  {
    path: '/Modelibr/__docusaurus/debug/config',
    component: ComponentCreator('/Modelibr/__docusaurus/debug/config', '40d'),
    exact: true
  },
  {
    path: '/Modelibr/__docusaurus/debug/content',
    component: ComponentCreator('/Modelibr/__docusaurus/debug/content', '1fd'),
    exact: true
  },
  {
    path: '/Modelibr/__docusaurus/debug/globalData',
    component: ComponentCreator('/Modelibr/__docusaurus/debug/globalData', '0e1'),
    exact: true
  },
  {
    path: '/Modelibr/__docusaurus/debug/metadata',
    component: ComponentCreator('/Modelibr/__docusaurus/debug/metadata', '055'),
    exact: true
  },
  {
    path: '/Modelibr/__docusaurus/debug/registry',
    component: ComponentCreator('/Modelibr/__docusaurus/debug/registry', '184'),
    exact: true
  },
  {
    path: '/Modelibr/__docusaurus/debug/routes',
    component: ComponentCreator('/Modelibr/__docusaurus/debug/routes', 'da8'),
    exact: true
  },
  {
    path: '/Modelibr/markdown-page',
    component: ComponentCreator('/Modelibr/markdown-page', 'fc1'),
    exact: true
  },
  {
    path: '/Modelibr/docs',
    component: ComponentCreator('/Modelibr/docs', '627'),
    routes: [
      {
        path: '/Modelibr/docs',
        component: ComponentCreator('/Modelibr/docs', 'aa0'),
        routes: [
          {
            path: '/Modelibr/docs',
            component: ComponentCreator('/Modelibr/docs', '369'),
            routes: [
              {
                path: '/Modelibr/docs',
                component: ComponentCreator('/Modelibr/docs', '78e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/ai-documentation/API_CONTRACTS',
                component: ComponentCreator('/Modelibr/docs/ai-documentation/API_CONTRACTS', '652'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/ai-documentation/BACKEND_API',
                component: ComponentCreator('/Modelibr/docs/ai-documentation/BACKEND_API', 'f3f'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/ai-documentation/BLENDER_ADDON',
                component: ComponentCreator('/Modelibr/docs/ai-documentation/BLENDER_ADDON', '7e6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/ai-documentation/FRONTEND',
                component: ComponentCreator('/Modelibr/docs/ai-documentation/FRONTEND', 'ef5'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/ai-documentation/MCP_TESTING_REPORT',
                component: ComponentCreator('/Modelibr/docs/ai-documentation/MCP_TESTING_REPORT', '64a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/ai-documentation/TESTING',
                component: ComponentCreator('/Modelibr/docs/ai-documentation/TESTING', '146'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/ai-documentation/TEXTURE_CHANNEL_MAPPING',
                component: ComponentCreator('/Modelibr/docs/ai-documentation/TEXTURE_CHANNEL_MAPPING', '876'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/ai-documentation/WORKER',
                component: ComponentCreator('/Modelibr/docs/ai-documentation/WORKER', 'be9'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/category/ai-documentation',
                component: ComponentCreator('/Modelibr/docs/category/ai-documentation', 'fa0'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/category/features',
                component: ComponentCreator('/Modelibr/docs/category/features', '5fc'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/changelog',
                component: ComponentCreator('/Modelibr/docs/changelog', '0f5'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/features/blender-addon',
                component: ComponentCreator('/Modelibr/docs/features/blender-addon', '735'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/features/models',
                component: ComponentCreator('/Modelibr/docs/features/models', '235'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/features/recycled-files',
                component: ComponentCreator('/Modelibr/docs/features/recycled-files', '61a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/features/texture-sets',
                component: ComponentCreator('/Modelibr/docs/features/texture-sets', 'eb6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/features/user-interface',
                component: ComponentCreator('/Modelibr/docs/features/user-interface', '571'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Modelibr/docs/roadmap',
                component: ComponentCreator('/Modelibr/docs/roadmap', '37b'),
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
    path: '/Modelibr/',
    component: ComponentCreator('/Modelibr/', 'a09'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
