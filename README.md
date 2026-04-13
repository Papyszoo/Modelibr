# Modelibr

[![.NET](https://img.shields.io/badge/.NET-9.0-512BD4)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.180-000000)](https://threejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-BSL_1.1-blue)](LICENSE)

Modelibr is a self-hosted game asset library. It keeps **models**, **texture sets**, **environment maps**, **sprites**, and **sounds** in one place, lets you preview them in the browser, and helps you organize them into **projects** and reusable **packs**.

**[Main Site](https://papyszoo.github.io/Modelibr/)** | **[Documentation](https://papyszoo.github.io/Modelibr/docs)** | **[Live Demo](https://papyszoo.github.io/Modelibr/demo/)** | **[Discord](https://discord.gg/KgwgTDVP3F)** | **[GitHub Issues](https://github.com/Papyszoo/Modelibr/issues)**

The live demo stores its data in your browser, so what you add there is visible only to you.

---

## Main features

| Title | Description |
| --- | --- |
| **All your asset types in one place** | Store models, texture sets, environment maps, sprites, and sounds in the same library instead of spreading them across different tools. |
| **Projects and packs** | Group assets into project-specific collections or reusable packs you can use again later. |
| **Model version history** | Keep multiple versions of the same model and switch between them when needed. |
| **Built-in previews** | Browse models, environment maps, sprites, and sounds with generated previews, including a lit Three.js environment map viewer. |
| **Environment map variants** | Upload panoramic files or six cube faces (`px/nx/py/ny/pz/nz`), keep multiple size variants, choose the preview variant, and override it with a custom thumbnail when needed. |
| **Texture set workflows** | Attach texture sets to model versions, choose defaults, and work with channel-packed maps. |
| **Dual-panel workspace** | Open tabs side by side and keep your current layout in the URL for easy sharing and return visits. |
| **WebDAV access** | Work with the library through a file-browser style workflow when that fits better than a browser-only flow. |
| **Blender CLI at runtime** | Download Blender CLI from Settings when you need it instead of treating it as a fixed install requirement from day one. |
| **Recycle bin and deduplication** | Restore deleted assets and avoid wasting storage on identical files. |

---

## Quick start

```bash
git clone https://github.com/Papyszoo/Modelibr.git
cd Modelibr
cp .env.example .env
docker compose up -d
```

Open **https://localhost:3010** in your browser. The first visit uses a self-signed certificate, so your browser may ask you to continue manually.

---

## WebDAV and Blender

- WebDAV gives Modelibr a more file-browser style workflow, which is useful when you want the library to sit closer to art-pipeline tools.
- Environment maps are exposed through WebDAV globally and inside packs/projects, alongside the rest of the library.
- Blender-related flows are part of the repository, and Blender CLI can be downloaded at runtime from the Settings page when you want that workflow.
- If you want more detail, start with the [main site](https://papyszoo.github.io/Modelibr/) and the [documentation](https://papyszoo.github.io/Modelibr/docs).

---

## Read more

- [Getting Started](https://papyszoo.github.io/Modelibr/docs)
- [Model Management](https://papyszoo.github.io/Modelibr/docs/features/models)
- [Texture Sets](https://papyszoo.github.io/Modelibr/docs/features/texture-sets)
- [Environment Maps](https://papyszoo.github.io/Modelibr/docs/features/environment-maps)
- [Packs](https://papyszoo.github.io/Modelibr/docs/features/packs)
- [Projects](https://papyszoo.github.io/Modelibr/docs/features/projects)
- [User Interface](https://papyszoo.github.io/Modelibr/docs/features/user-interface)

---

## Supported model uploads

- `.obj`
- `.fbx`
- `.gltf`
- `.glb`
- `.blend`

## Supported environment map uploads

- panoramic uploads in common image formats supported by the preview pipeline
- `.hdr`
- `.exr`
- six-face cube uploads using `px`, `nx`, `py`, `ny`, `pz`, and `nz`

---

## Feedback and bug reports

- **Feature requests and general feedback:** [Discord](https://discord.gg/KgwgTDVP3F)
- **Bug reports:** [Discord](https://discord.gg/KgwgTDVP3F) or [GitHub Issues](https://github.com/Papyszoo/Modelibr/issues)

---

## License

Business Source License 1.1 — free to use, modify, and self-host. See [LICENSE](LICENSE) for details.
