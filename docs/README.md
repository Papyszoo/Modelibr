# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
npm ci
```

## Local Development

```bash
npm start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

The site is **not** deployed from this directory, and not by Docusaurus' own
`deploy` command - it is served from the project's own domain at the site root,
not from GitHub Pages.

CI builds the full bundle (these docs, plus Storybook and the demo app copied in
alongside) and uploads it as the `docs-site` artifact. A maintainer publishes
that artifact to the web root as part of cutting a release.

Feature videos are not part of the bundle. They need a real GPU, so they are
rendered and published separately with `npm run videos:generate` and
`npm run videos:publish` from the repo root, and live under the site's own
`/videos/` path - which is why the pages reference them by absolute URL.
