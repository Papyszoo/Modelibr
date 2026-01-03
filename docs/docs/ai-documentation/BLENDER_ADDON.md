---
sidebar_position: 2
---

# Blender Addon

The Modelibr Blender addon enables direct integration with the server for browsing, importing, and uploading 3D models.

## Purpose

Allow Blender users to:
- Browse and import models from Modelibr server
- Upload new versions of imported models
- Upload current scene as new model
- Open models via `modelibr://` URI from web app

## Where to Look

| Component | Location |
|-----------|----------|
| Main addon code | `blender-addon/modelibr/` |
| API client | `blender-addon/modelibr/api_client.py` |
| UI panels | `blender-addon/modelibr/panels.py` |
| Browse window | `blender-addon/modelibr/browse_window.py` |
| Operators | `blender-addon/modelibr/operators/` |
| Texture handling | `blender-addon/modelibr/texture_utils.py` |
| URI handler | `blender-addon/install_uri_handler.py` |
| Tests (unit) | `blender-addon/tests/unit/` |
| Tests (e2e) | `blender-addon/tests/e2e/` |
| Documentation | `blender-addon/README.md` |

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/models` | GET | List all models |
| `/models/{id}` | GET | Get model details |
| `/models/{id}/versions` | GET/POST | Get or create versions |
| `/files/{id}` | GET | Download file |
| `/models/{id}/thumbnail/file` | GET | Download thumbnail |

## Key Behaviors

- **Import**: Downloads active version file (priority: GLB > FBX > OBJ > .blend)
- **Upload Version**: Exports scene, uploads to existing model
- **Upload New**: Exports scene, creates new model in server
- **URI Handler**: Registers `modelibr://` protocol for "Open in Blender" buttons

## Effects of Changes

- **API changes** → Update `api_client.py`
- **UI changes** → Update `panels.py` or `browse_window.py`
- **Texture handling** → `texture_utils.py` (21KB - handles UV conventions)
- **File format changes** → Update operators and import/export logic

## Testing

```bash
cd blender-addon/tests
python run_tests.py
```

Unit tests cover: api_client, async_handler, config, texture_utils, tracking
