# Modelibr Frontend

React frontend for the Modelibr self-hosted asset library.

## Development

```bash
npm install
npm run dev
npm run build
npm test
```

The local dev server runs at **http://localhost:3010**.

When you run the full app through Docker Compose, open **https://localhost:3010**.

## What lives here

- model library and viewer
- texture sets
- packs and projects
- sprites and sounds
- recycle bin, settings, and workspace layout state

## API integration

Frontend HTTP goes through feature-local API modules under `src/features/*/api/` and uses `VITE_API_BASE_URL` for its backend base path. In Docker, the frontend reaches the backend through nginx via `/api`.

## Testing

See [TESTING.md](./TESTING.md) for testing details.
