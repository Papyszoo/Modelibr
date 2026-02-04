---
sidebar_position: 1
slug: /
---

# Getting Started

Modelibr is a self-hosted 3D model library that helps you organize, preview, and manage your 3D assets.

## Features

- **3D Model Library** - Upload and organize OBJ, FBX, GLTF/GLB, and Blender files
- **Automatic Thumbnails** - Generated previews for quick browsing
- **Version Control** - Track changes with multiple versions per model
- **Texture Sets** - Manage PBR textures and apply them to models
- **Blender Integration** - Direct import/export via addon
- **Recycle Bin** - Safe deletion with restore capability

## Quick Start

### 1. Prerequisites

Modelibr runs on Docker. This ensures it works on any system without polluting your computer with dependencies.

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

- `WEBAPI_HTTP_PORT`: Port for the backend API (Default: 8080).
- `FRONTEND_PORT`: Port for the web interface (Default: 3000).
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
Run `docker compose ps` to see the status of the containers. All services (`webapi`, `frontend`, `thumbnail-worker`, `postgres`) should be "running" or "healthy".

### 5. Access the Interface

Open your browser and visit:
[**http://localhost:3000**](http://localhost:3000)

### Where is my data?

All your uploaded models, generated thumbnails, and database files are stored in the **`data`** folder within the project directory.

- `data/uploads`: Your raw 3D model files.
- `data/thumbnails`: Generated images and 3D previews.
- `data/postgres`: Database files.

:::warning
Back up the `data` folder regularly to keep your library safe!
:::

## Next Steps

- [Model Management](/docs/features/models) - Learn about versions and organization
- [Texture Sets](/docs/features/texture-sets) - Apply PBR textures to your models
- [Blender Addon](/docs/features/blender-addon) - Integrate with your Blender workflow
