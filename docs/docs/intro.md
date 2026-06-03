---
sidebar_position: 1
slug: /
---

# Getting Started

Modelibr is a self-hosted game asset library that helps you keep models, texture sets, environment maps, sprites, sounds, and grouped asset collections in one place.

## Features

- **Models with version history** - Keep track of changes without losing older versions
- **Texture sets** - Manage PBR textures, defaults, and channel-packed maps
- **Environment maps** - Upload panoramic HDRIs or cube faces, keep multiple variants, and preview lighting in the browser
- **Sprites and sounds** - Keep 2D and audio assets in the same library as your models
- **Projects and packs** - Group assets either for a specific job or for reuse across jobs
- **Recycle bin and deduplication** - Recover mistakes without wasting storage
- **Optional Blender workflow** - Use Blender-related tooling and WebDAV when it fits your process

## Quick Start

### Option A: Native installer

If you want the simplest local setup, download the **Modelibr** (host) installer for your platform from the GitHub Releases page. It targets users who can't run the Docker stack.

- Windows, macOS, and Linux installers bundle the frontend, WebApi, asset processor, and PostgreSQL.
- The host runs from a tray / menu-bar icon. Use its **Show Status** window for live service health (backend, database, asset processor) and the frontend URL.
- The application and WebDAV are exposed on the same local configurable port.
- Worker process count, jobs per worker, GPU acceleration, and the app port are configured in the host status window's **Configuration** panel.
- An optional **Modelibr Client** installer opens a running host in its own desktop window instead of a browser tab.

Native installs store data in your operating system's application data folder instead of the repository `data` directory.

### Option B: Docker

### 1. Prerequisites

Modelibr runs on Docker. This remains the most transparent source-based setup and keeps all runtime data in the repository folder.

<details>
<summary>**How to install Docker**</summary>

Docker Desktop is the easiest way to get started.

- **Windows**: Download [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/).
- **Mac**: Download [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/).
- **Linux**: Follow the [Docker Engine installation guide](https://docs.docker.com/engine/install/).

**Important:** After installation, launch Docker Desktop and ensure it is running in the background. You can verify this by opening a terminal and typing `docker --version`.

</details>

### 2. Get the Application

<details>
<summary>**How to download the source code**</summary>

You have two options:

**Option A: Using Git (Recommended)**
If you have Git installed:

```bash
git clone https://github.com/Papyszoo/Modelibr.git
cd Modelibr
```

**Option B: Download ZIP**

1. Go to the [Modelibr GitHub page](https://github.com/Papyszoo/Modelibr).
2. Click the green **Code** button and select **Download ZIP**.
3. Extract the ZIP file to a folder on your computer.

</details>

<details>
<summary>**How to open and use the terminal**</summary>

You need to run commands in a terminal (command prompt) inside the Modelibr folder.

- **Windows**: Open the Modelibr folder in File Explorer. Type `cmd` in the address bar and press Enter.
- **Mac/Linux**: Open Terminal and use `cd` to navigate to the folder (e.g., `cd ~/Downloads/Modelibr`).

</details>

### 3. Configuration (Optional)

Modelibr comes with a default configuration that works out of the box, but you can customize it if needed.

<details>
<summary>**How to configure .env settings**</summary>

1.  In the project root, locate the `.env.example` file.
2.  Copy it and rename the copy to `.env`.
3.  Open `.env` with a text editor (Notepad, VS Code, etc.).

**Key Settings:**

- `HTTPS_PORT`: HTTPS port for the backend API (Default: 8443).
- `EXPOSE_443_PORT`: Also bind to port 443 for Windows WebDAV compatibility (Default: true).
- `FRONTEND_PORT`: Port for the web interface (Default: 3010).
- `POSTGRES_PASSWORD`: Database password (change this for security).
- **Note**: The data storage path is managed by Docker volumes (mapped to `./data` folder in the project root) and does not need to be changed in the `.env` file for standard usage.

</details>

### 4. Start the Application

Open your terminal in the project folder and run:

```bash
docker compose up -d
```

:::info
This command tells Docker to download the necessary components (images) and start them in the background. The first run might take a few minutes depending on your internet connection.
:::

**Check if it's running:**
Run `docker compose ps` to see the status of the containers. All services (`webapi`, `frontend`, `asset-processor`, `postgres`) should be "running" or "healthy".

### 5. Access the Interface

Open your browser and visit:
[**https://localhost:3010**](https://localhost:3010)

Your browser may show a warning on first launch because Modelibr uses a local self-signed certificate in development.

### Where is my data?

All your uploaded assets, generated thumbnails, and database files are stored in the **`data`** folder within the project directory.

- `data/uploads`: Your uploaded asset files.
- `data/thumbnails`: Generated images and 3D previews.
- `data/postgres`: Database files.

:::warning
Back up the `data` folder regularly to keep your library safe!
:::

For native installs, the same data lives in the host-managed application data directory. Open it from the host tray menu's **Open Data Folder** action (or the **Data folder** button in the status window).

## Next Steps

- [Model Management](/docs/features/models) - Learn about versions and organization
- [Texture Sets](/docs/features/texture-sets) - Apply PBR textures to your models
- [Environment Maps](/docs/features/environment-maps) - Manage panoramic and cube-based lighting assets
- [Packs](/docs/features/packs) - Build reusable asset bundles
- [Projects](/docs/features/projects) - Organize assets for a specific production
