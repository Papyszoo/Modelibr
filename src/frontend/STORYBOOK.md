# Storybook Integration Summary

## Overview

Successfully integrated Storybook 9.1.10 into the Modelibr React frontend for interactive component documentation and development.

## What Was Added

### Dependencies

- `storybook@9.1.10` - Core Storybook package
- `@storybook/react-vite@9.1.10` - Vite framework integration
- `@storybook/addon-docs@9.1.10` - Automatic documentation generation
- `@storybook/addon-onboarding@9.1.10` - First-time user onboarding

### Configuration Files

#### `.storybook/main.ts`

- Story file patterns: `src/**/*.stories.@(js|jsx|mjs|ts|tsx)`
- Framework: React with Vite
- Static directory: `public/` for assets
- Addons: docs and onboarding

#### `.storybook/preview.ts`

- PrimeReact theme integration (Lara Dark Blue)
- Global styles import
- Background options (dark/light)
- Control matchers for colors and dates

### Component Stories

#### 1. LoadingPlaceholder.stories.tsx

- **Location**: `src/components/LoadingPlaceholder.stories.tsx`
- **Type**: 3D Three.js component
- **Features**:
  - Wrapped in Canvas for Three.js rendering
  - Fullscreen layout
  - Ambient lighting setup

#### 2. ModelInfo.stories.tsx

- **Location**: `src/features/model-viewer/components/ModelInfo.stories.tsx`
- **Stories**:
  - Default (OBJ model)
  - GLTF Model
  - FBX Model
- **Features**: Interactive props for different model types

#### 3. ThumbnailDisplay.stories.tsx

- **Location**: `src/features/thumbnail/components/ThumbnailDisplay.stories.tsx`
- **Stories**:
  - Ready state
  - Processing state
  - Failed state
  - Placeholder state
- **Features**:
  - Uses actual ThumbnailDisplay component
  - Mocks ApiClient for different states using decorators
  - Demonstrates simple, focused component design

#### 4. EmptyState.stories.tsx

- **Location**: `src/features/models/components/EmptyState.stories.tsx`
- **Stories**:
  - Default (visible)
  - Hidden
- **Features**: Drag-and-drop event handlers

#### 5. ErrorState.stories.tsx

- **Location**: `src/features/models/components/ErrorState.stories.tsx`
- **Stories**:
  - Default (Network Error)
  - Database Error
  - Generic Error
  - Hidden
- **Features**: PrimeReact Button integration

### Example Stories (from Storybook init)

- Button component with multiple variants
- Header component with user states
- Page component composition
- Configure.mdx documentation page

## NPM Scripts

```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build"
}
```

## Usage

### Running Storybook

```bash
cd src/frontend
npm run storybook
```

Access at: http://localhost:6006

### Building Static Storybook

```bash
cd src/frontend
npm run build-storybook
```

Output: `src/frontend/storybook-static/`

## Documentation Updates

### README.md Changes

1. Added Storybook to Frontend technology stack
2. Added "Component Documentation (Storybook)" section with:
   - Feature overview
   - Available stories list
   - Screenshots
   - Running/building instructions
3. Added to development workflow
4. Added to acknowledgments

### Screenshots Included

- ModelInfo component documentation: https://github.com/user-attachments/assets/c191f88b-9b39-45c0-bfa9-8f8d34efe1ed

## .gitignore Updates

Already configured to exclude:

- `*storybook.log`
- `storybook-static/`

## Testing

- All existing frontend tests pass
- Storybook dev server runs successfully
- Storybook builds without errors
- All component stories render correctly

## Benefits

1. **Developer Experience**: Isolated component development and testing
2. **Documentation**: Auto-generated, interactive component docs
3. **Visual Testing**: Easy visual regression testing setup
4. **Design System**: Foundation for component library documentation
5. **Collaboration**: Shareable component examples for designers and stakeholders

## Future Enhancements

- Integrate visual regression testing
- Add accessibility addon
- Create design system documentation
- Add interaction testing with play functions

---

## Conventions for new stories

These rules keep Storybook useful as the codebase grows. When in doubt:
_if the component cannot render in isolation, it does not belong in
Storybook._

### What SHOULD have a story

- **Presentational primitives** under `src/shared/components/`
  (e.g. `Dialog`, `EmptyState`, `LoadingState`, `ErrorState`,
  `ListHeader`, `CardWidthSlider`).
- **Reusable feature components** that take all data via props and have no
  side effects (e.g. `ModelListHeader`, `TextureCard`, `SoundCard`).
- **Visual variants of a component** — one story per meaningful state
  (default, empty, loading, error, hover, disabled, mobile breakpoint).

### What should NOT have a story

- **Page-level / orchestrator components** (e.g. `ModelViewer`,
  `SceneEditor`, `TextureSetViewer`, `ModelGrid`). They wire up routing,
  contexts, queries, and mutations. Storybook can't usefully render them
  and the story becomes a maintenance burden.
- **Components that fetch their own data** via `useQuery` /
  `useMutation` / direct API calls. Either split presentation from data
  fetching first, or skip the story.
- **Components tightly coupled to React contexts** owned by the app shell
  (e.g. `TabContext`, `ModelProvider`, `DockPanelActionsContext`).

### Mocking

- API calls go through **MSW** — handlers in
  [`src/mocks/handlers.ts`](src/mocks/handlers.ts) are registered globally
  in `.storybook/preview.ts`. Per-story overrides go in
  `parameters.msw.handlers`.
- Do NOT mock the `apiClient` directly inside a story — use MSW instead so
  the story exercises the same network path as the app.

### Story file template

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { MyComponent } from './MyComponent'

const meta: Meta<typeof MyComponent> = {
  title: 'Shared/Feedback/MyComponent', // Domain/Category/Name
  component: MyComponent,
  tags: ['autodocs'],
  parameters: { layout: 'centered' }, // 'centered' | 'padded' | 'fullscreen'
  args: {
    /* sensible defaults */
  },
}

export default meta
type Story = StoryObj<typeof MyComponent>

export const Default: Story = {}
export const Loading: Story = {
  args: {
    /* ... */
  },
}
export const Error: Story = {
  args: {
    /* ... */
  },
}
```

### Title hierarchy

- `Shared/<Category>/<Name>` for primitives in `src/shared/`
- `<Feature>/<Name>` for feature components (e.g. `Models/ModelListHeader`)

### Design tokens

All app surfaces should use the `--mod-*` CSS variables defined in
[`src/shared/styles/tokens.css`](src/shared/styles/tokens.css). Storybook
loads them via `.storybook/preview.ts`, so token-based components render
identically to the running app.
