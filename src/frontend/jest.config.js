export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    // CSS rule must precede the '@/' alias: Jest uses first-match-wins, and
    // an '@/...css' import would otherwise resolve to a real file and fail to
    // parse. Keep style stubs ahead of path aliases.
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(ts|tsx|js|jsx|mjs)$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(ts|tsx|js|jsx)',
    '<rootDir>/src/**/*.(test|spec).(ts|tsx|js|jsx)',
  ],
  collectCoverageFrom: [
    'src/**/*.(ts|tsx|js|jsx)',
    '!src/main.tsx',
    '!src/setupTests.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  transformIgnorePatterns: ['node_modules/(?!(three|@react-three|.*\\.mjs$))'],
}
