# Frontend Testing

This directory contains tests for the Modelibr frontend React application.

## Test Structure

- `src/utils/__tests__/` - Tests for utility functions
- `src/components/__tests__/` - Tests for React components
- `src/services/__tests__/` - Tests for API client services
- `src/setupTests.js` - Jest setup configuration

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Coverage

Current test coverage includes:

### Utility Functions (100% coverage)

- `fileUtils.js` - File format validation, size formatting, extension handling
  - File extension extraction
  - File format validation for 3D models
  - Three.js renderability checking
  - File size formatting
  - File name extraction

### Components

- `ModelInfo.jsx` - Model information display component
- `LoadingPlaceholder.jsx` - 3D loading placeholder component

### Services

- `ApiClient.js` - API interface and URL generation methods

### Additional Utilities

- Drag and drop functionality testing

## Test Infrastructure

- **Jest** - Test runner and assertion library
- **React Testing Library** - React component testing utilities
- **@testing-library/jest-dom** - DOM assertion matchers
- **identity-obj-proxy** - CSS import mocking

## Configuration

- `jest.config.js` - Jest configuration
- Coverage thresholds set to 60% for new code
- CSS imports automatically mocked
- JSDOM environment for browser API simulation

## Adding New Tests

1. Create test files in the appropriate `__tests__` directory
2. Follow the naming convention: `ComponentName.test.js`
3. Use React Testing Library for component tests
4. Mock external dependencies and complex UI components
5. Focus on testing business logic and user interactions

## Mocking Strategy

- Complex 3D rendering components are mocked to avoid WebGL dependencies
- API calls are mocked using Jest mock functions
- CSS imports are handled by identity-obj-proxy
- Browser APIs (IntersectionObserver, ResizeObserver) are mocked in setupTests.js
