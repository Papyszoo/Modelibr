# Code Quality Guidelines

This document outlines the code quality standards and tools used in the Modelibr project.

## Overview

Modelibr uses ESLint and Prettier to enforce consistent code style and catch potential issues across JavaScript/TypeScript projects. The configuration includes architectural lint rules that enforce Clean Architecture boundaries.

## Tools

- **ESLint**: Static analysis tool for identifying problematic patterns in JavaScript/TypeScript code
- **Prettier**: Opinionated code formatter that enforces consistent style
- **GitHub Actions**: Automated CI/CD pipeline that fails builds on rule violations

## Supported Projects

### Frontend (React/TypeScript)
- Location: `src/frontend/`
- ESLint config: `eslint.config.js`
- Prettier config: `.prettierrc`
- TypeScript support with React-specific rules
- Architectural boundary enforcement

### Worker Service (Node.js)
- Location: `src/worker-service/`  
- ESLint config: `eslint.config.js`
- Prettier config: `.prettierrc`
- Node.js/ES modules configuration
- Business logic separation rules

## Scripts

### Project-Level Scripts (run from root)
```bash
# Lint all JavaScript projects
npm run lint

# Fix auto-fixable lint issues
npm run lint:fix

# Format all code with Prettier
npm run format

# Check if code is properly formatted
npm run format:check

# Test frontend
npm run test:frontend

# Build frontend
npm run build:frontend
```

### Individual Project Scripts
```bash
# Frontend (from src/frontend/)
npm run lint         # Run ESLint
npm run lint:fix     # Fix auto-fixable issues
npm run format       # Format with Prettier
npm run format:check # Check formatting
npm test            # Run tests
npm run build       # Build for production

# Worker Service (from src/worker-service/)
npm run lint         # Run ESLint
npm run lint:fix     # Fix auto-fixable issues
npm run format       # Format with Prettier
npm run format:check # Check formatting
```

## Architectural Rules

### Frontend (React)
- **Components** cannot directly import from services (use hooks/contexts instead)
- **Utils** cannot import from components or hooks (maintain separation)
- **Services** cannot import from components or hooks (maintain separation)
- **Tests** have relaxed rules allowing direct imports for testing purposes

### Worker Service (Node.js)
- **Configuration** modules cannot import business logic
- **Business logic** cannot import server startup modules
- Maintains separation between configuration, business logic, and infrastructure

## ESLint Configuration

### Frontend Rules
- TypeScript-specific rules with React support
- React Hooks rules for proper hook usage
- React Refresh rules for development
- Prettier integration
- Custom architectural boundary rules
- Test file exceptions

### Worker Service Rules
- Node.js/ES modules configuration
- Prettier integration
- Architectural separation rules
- Modern JavaScript standards (ES2022)

## Prettier Configuration

Both projects use consistent Prettier settings:
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 80,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

## CI/CD Integration

The GitHub Actions workflow (`.github/workflows/code-quality.yml`) automatically:

1. **Runs on**:
   - Push to `main` or `develop` branches
   - Pull requests to `main` or `develop` branches
   - Only when JavaScript files change

2. **Frontend Quality Checks**:
   - Install dependencies
   - Run ESLint (fails on errors)
   - Check Prettier formatting (fails if not formatted)
   - Run tests
   - Build project

3. **Worker Service Quality Checks**:
   - Install dependencies  
   - Run ESLint (fails on errors)
   - Check Prettier formatting (fails if not formatted)

4. **Combined Status**: Provides single status for branch protection rules

## Development Workflow

### Before Committing
```bash
# Run from project root
npm run lint:fix    # Fix auto-fixable issues
npm run format      # Format all code
npm run lint        # Verify no remaining issues
```

### IDE Integration
Configure your IDE to:
- Run ESLint on save
- Format with Prettier on save
- Show lint errors inline

### Recommended IDE Extensions
- **VS Code**: ESLint, Prettier - Code formatter
- **WebStorm**: Built-in ESLint and Prettier support

## Rule Violations

### ESLint Errors
ESLint errors must be fixed before code can be merged. Common fixes:
- Remove unused variables (prefix with `_` if intentionally unused)
- Fix import violations (respect architectural boundaries)
- Add missing dependencies to React hooks

### Prettier Violations
Format violations are automatically fixable:
```bash
npm run format
```

### Architectural Violations
These indicate design issues that should be addressed:
- Move service imports from components to hooks
- Extract shared utilities to avoid circular dependencies
- Separate configuration from business logic

## Customization

### Adding New Rules
1. Update the appropriate `eslint.config.js`
2. Test the rule doesn't break existing code
3. Document the new rule in this file

### Excluding Files
- Add patterns to `.prettierignore` for formatting exclusions
- Use `ignores` in ESLint config for linting exclusions
- Use `eslint-disable` comments for specific rule exceptions

### IDE Specific Settings
Create `.vscode/settings.json` for VS Code-specific configuration:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.format.enable": true
}
```

## Troubleshooting

### "ESLint command not found"
Run `npm install` in the project directory.

### "Prettier check failed"
Run `npm run format` to auto-fix formatting issues.

### Architectural rule violations
Review the import statement and move it to the appropriate layer following Clean Architecture principles.

### Performance Issues
ESLint can be slow on large projects. Consider:
- Adding more specific file patterns in config
- Using `--cache` flag for repeated runs
- Excluding large generated files