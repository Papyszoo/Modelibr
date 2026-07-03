<div align="center">

# Modelibr

**Every game asset you own — models, textures, sprites, sounds, scripts — in one self-hosted, local-first library.**

[![Latest release](https://img.shields.io/github/v/release/Papyszoo/Modelibr?label=release)](https://github.com/Papyszoo/Modelibr/releases/latest)
[![License](https://img.shields.io/badge/license-BSL_1.1-blue)](LICENSE)
[![Discord](https://img.shields.io/badge/chat-Discord-5865F2)](https://discord.gg/KgwgTDVP3F)

[**Website**](https://papyszoo.github.io/Modelibr/) · [**Live demo**](https://papyszoo.github.io/Modelibr/demo/) · [**Docs**](https://papyszoo.github.io/Modelibr/docs) · [**Discord**](https://discord.gg/KgwgTDVP3F) · [**Issues**](https://github.com/Papyszoo/Modelibr/issues)

<!-- TODO: hero screenshot of a populated library — capture and uncomment:
![Modelibr library and 3D viewer](docs/static/img/screenshots/hero.png)
-->

**[Try the live demo →](https://papyszoo.github.io/Modelibr/demo/)**
No install, no account — demo data stays in your browser.

</div>

---

## Why Modelibr

Your assets never leave your machine. Modelibr runs fully locally — no cloud, no
account, no internet required once it's running. Instead of five folders and a
spreadsheet, you get one searchable library with real previews for everything a
game project accumulates.

- 🗂️ **Every asset type in one place** — 3D models, texture sets, environment maps, sprites, sounds, and scripts
- 🔍 **Previews built in** — orbit models in a lit Three.js viewer, audition sounds, flip through sprites, inspect environment maps
- 🎨 **Texture set workflows** — attach texture sets to model versions, choose defaults, and work with channel-packed maps
- 📜 **Scripts with live previews** — keep shaders and source snippets with syntax highlighting and in-page shader/scene previews
- 📦 **Projects & packs** — group assets per project, or build reusable packs you'll reach for again
- 🕘 **Version history** — keep every iteration of a model and switch between them
- 🖥️ **Dual-panel workspace** — open tabs side by side; your layout lives in the URL for easy sharing and return visits
- 🪟 **WebDAV drive** — mount the library like a folder and save from Blender straight into it; Blender CLI downloads at runtime from Settings
- ♻️ **Recycle bin & deduplication** — undo deletes; identical files are stored once

## Install

### Desktop app (easiest)

Download **Modelibr** for your platform from the [latest release](https://github.com/Papyszoo/Modelibr/releases/latest) — Windows `.exe`, macOS `.dmg`, or Linux `.AppImage`/`.deb`. It bundles the database, API, and render worker, lives in your tray, and updates itself. Open **Show Status** for service health, the frontend URL, and configuration (port, worker count, GPU acceleration).

The separate **Modelibr Client** download is an optional thin window for connecting to a host running elsewhere — point it at the URL shown in the host's status window.

> macOS builds are not yet code-signed, so in-app updates are limited on macOS for now — download the new `.dmg` from Releases instead.

### Docker

```bash
git clone https://github.com/Papyszoo/Modelibr.git && cd Modelibr
cp .env.example .env
docker compose up -d
```

Then open **https://localhost:3010** (the self-signed certificate will ask you to continue manually).

Your data lives in PostgreSQL plus the upload/thumbnail volumes configured in `.env` — back those up and you've backed up everything. To update: `git pull && docker compose up -d --build`.

## Supported formats

| Asset type | Formats |
| --- | --- |
| **3D models** | `.obj` `.fbx` `.gltf` `.glb` `.stl` `.3mf`, plus `.blend` project files |
| **Textures** | `.png` `.jpg` `.tga` `.bmp` `.tif` `.exr`, with channel-packed map support |
| **Environment maps** | `.hdr` / `.exr` / image panoramas, or six cube faces (`px nx py ny pz nz`) |
| **Sprites** | `.png` `.gif` `.webp` `.apng`, including sprite sheets |
| **Sounds** | `.mp3` `.wav` `.ogg` `.flac` `.aac` `.m4a` |
| **Scripts** | Common source and shader files (JavaScript, TypeScript, Python, C#, Lua, GLSL, HLSL, GDScript, …) |

## Learn more

[Getting started](https://papyszoo.github.io/Modelibr/docs) · [Models](https://papyszoo.github.io/Modelibr/docs/features/models) · [Texture sets](https://papyszoo.github.io/Modelibr/docs/features/texture-sets) · [Environment maps](https://papyszoo.github.io/Modelibr/docs/features/environment-maps) · [Packs](https://papyszoo.github.io/Modelibr/docs/features/packs) · [Projects](https://papyszoo.github.io/Modelibr/docs/features/projects) · [WebDAV](https://papyszoo.github.io/Modelibr/docs/features/webdav) · [User interface](https://papyszoo.github.io/Modelibr/docs/features/user-interface) · [Roadmap](https://papyszoo.github.io/Modelibr/docs/roadmap) · [Changelog](https://papyszoo.github.io/Modelibr/docs/changelog)

## Development

<details>
<summary><strong>Stack, dev loop, and tests</strong></summary>

| Part | Stack |
| --- | --- |
| `src/WebApi` + `Application`/`Domain`/`Infrastructure` | .NET 9 minimal API, Clean Architecture, CQRS, PostgreSQL (EF Core) |
| `src/frontend` | React 19 + TypeScript + Vite, Three.js |
| `src/asset-processor` | Node.js worker — thumbnails and renders via Puppeteer + Three.js + Blender CLI |
| `src/desktop` | Electron tray host and thin-client installers |

`docker compose up -d` brings up the full stack for development too.

```bash
npm run test:all        # run any subset of the test suites (interactive picker)
npm run test:all:full   # run everything, non-interactive
npm run test:site       # Test Studio — browse every test, CI lanes, timings
npm run test:audit      # flag suites missing from the runner manifest
```

Suites are self-contained (Docker stacks start and stop themselves). See
[scripts/test-runner](scripts/test-runner/README.md) and
[scripts/test-catalog](scripts/test-catalog/README.md).

</details>

Contributions are welcome — open PRs against the current `version/x.y.z` branch (`main` tracks released versions), and use [conventional commits](https://www.conventionalcommits.org/).

## Feedback and bug reports

- **Feature requests and general feedback:** [Discord](https://discord.gg/KgwgTDVP3F)
- **Bug reports:** [GitHub Issues](https://github.com/Papyszoo/Modelibr/issues) or Discord

## License

[Business Source License 1.1](LICENSE) — free to use, modify, and self-host, including inside commercial teams, forever. The only restriction: you may not use it to run a competing public asset marketplace.
