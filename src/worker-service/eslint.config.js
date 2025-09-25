import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'

export default [
  {
    ignores: ['node_modules/'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      prettier: prettier,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],

      // Architectural boundary rules - prevent config from importing business logic
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                './jobProcessor*',
                './thumbnailJobService*',
                './modelFileService*',
              ],
              message:
                'Configuration should not import business logic modules.',
            },
          ],
        },
      ],
    },
  },
  // Override architectural rules for business logic files
  {
    files: [
      'jobProcessor.js',
      'thumbnailJobService.js',
      'modelFileService.js',
      'modelLoaderService.js',
      'orbitFrameRenderer.js',
      'frameEncoderService.js',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./healthServer*', './index*'],
              message:
                'Business logic should not import server startup modules.',
            },
          ],
        },
      ],
    },
  },
]
