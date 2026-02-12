import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, globalIgnores } from 'eslint/config'

const featuresRoot = path.join(import.meta.dirname, 'src', 'features')
const featureNames = fs.existsSync(featuresRoot)
  ? fs
      .readdirSync(featuresRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  : []

const featureBoundaryConfigs = featureNames.map(featureName => {
  const otherFeatures = featureNames.filter(name => name !== featureName)
  const restrictedGroups = otherFeatures.flatMap(otherFeature => [
    `../${otherFeature}`,
    `../${otherFeature}/*`,
    `../../${otherFeature}`,
    `../../${otherFeature}/*`,
  ])

  return {
    files: [`src/features/${featureName}/**/*.{js,jsx,ts,tsx}`],
    ignores: [
      '**/*.test.{js,jsx,ts,tsx}',
      '**/__tests__/**/*.{js,jsx,ts,tsx}',
      '**/*.stories.{js,jsx,ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: restrictedGroups,
              message:
                'Direct imports across feature boundaries are not allowed. Use shared modules or feature APIs.',
            },
          ],
        },
      ],
    },
  }
})

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // TypeScript configuration
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier: prettier,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,
      ...reactRefresh.configs.vite.rules,
      ...prettierConfig.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
      'no-unused-vars': 'off', // Disable base rule as it can report incorrect errors
      'prettier/prettier': 'error',

      // Architectural boundary rules - will be overridden for specific directories
      'no-restricted-imports': 'off',
    },
  },
  // Architectural boundary rules for components (must come before test file exemptions)
  {
    files: ['**/components/**/*.{js,jsx,ts,tsx}'],
    ignores: [
      '**/*.test.{js,jsx,ts,tsx}',
      '**/__tests__/**/*.{js,jsx,ts,tsx}',
      '**/*.stories.{js,jsx,ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/*'],
              message:
                'Components should not directly import services. Use hooks or contexts instead.',
            },
          ],
        },
      ],
    },
  },
  // Architectural boundary rules for utils
  {
    files: ['**/utils/**/*.{js,jsx,ts,tsx}'],
    ignores: ['**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../components/*',
                '../../components/*',
                '**/components/*',
              ],
              message:
                'Utils should not import from components to maintain clean architecture.',
            },
            {
              group: ['../hooks/*', '../../hooks/*', '**/hooks/*'],
              message:
                'Utils should not import from hooks to maintain clean architecture.',
            },
          ],
        },
      ],
    },
  },
  // Architectural boundary rules for services
  {
    files: ['**/services/**/*.{js,jsx,ts,tsx}'],
    ignores: ['**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../components/*',
                '../../components/*',
                '**/components/*',
              ],
              message:
                'Services should not import from components to maintain clean architecture.',
            },
            {
              group: ['../hooks/*', '../../hooks/*', '**/hooks/*'],
              message:
                'Services should not import from hooks to maintain clean architecture.',
            },
          ],
        },
      ],
    },
  },
  ...featureBoundaryConfigs,
  // Configuration for test files and Storybook (must come after architectural rules)
  {
    files: [
      '**/*.test.{js,jsx,ts,tsx}',
      '**/__tests__/**/*.{js,jsx,ts,tsx}',
      '**/setupTests.{js,ts}',
      '**/__mocks__/**/*.{js,jsx,ts,tsx}',
      '**/*.stories.{js,jsx,ts,tsx}',
      '**/.storybook/**/*.{js,jsx,ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off', // Allow require() in tests
      '@typescript-eslint/no-explicit-any': 'off', // Allow any in tests/stories
      'no-restricted-imports': 'off', // Allow direct imports in tests
    },
  },
])
