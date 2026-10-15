---
description: The native Modelibr desktop host - install, tray and status window, data folder, network access over HTTPS, start on login, updates, and the desktop Client.
sidebar_position: 20
---

# Desktop app

The **Modelibr** desktop host runs the whole library natively on Windows, macOS
and Linux: it bundles the frontend, the Web API, the asset processor and
PostgreSQL, and runs from a tray or menu-bar icon. A separate **Modelibr Client**
app opens a running host in its own window instead of a browser tab.

<details>
<summary>Installing</summary>

Download the **Modelibr** (host) installer for your platform from the GitHub
Releases page. The host ships as a Windows installer, a macOS `.dmg`, and a
Linux AppImage or `.deb`. It is the option for users who can't run the Docker
stack; see [Getting Started](/docs) for the Docker path.

Native installs keep their data in your operating system's application data
folder, not in the repository `data` directory.

</details>

## The tray and the status window

The tray or menu-bar icon is the host's control surface. Left-click opens the
**status window**; right-click shows the menu:

- **Show Status** - open the status window
- An update item that changes with state (**Check for Updates** /
  **Download update v...** / **Restart & Install v...**)
- **Open in Browser** - opens the app (disabled until it is ready)
- **Install Desktop Client...** - opens the releases page
- **Open Data Folder** - reveals where your library lives
- **Restart** - restarts the host and its services
- **Quit Modelibr** - asks first, because it stops everything connected

The status window shows one overall state, an opt-in **Show details** breakdown
of the three services (**Modelibr service**, **Storage**, **Preview generator**),
a button to open the app, the address with a **Copy** button, and the **Settings**
panel.

## The Settings panel

The panel's **Settings** section holds the everyday options, with the less common
ones nested under **Advanced**. **Apply** reports either **Saved** or
**Saved - restart to apply**.

| Option                        | What it does                                                  | Default |
| ----------------------------- | ------------------------------------------------------------- | ------- |
| **App port**                  | The address you open Modelibr at, and what clients connect to | 3010    |
| **Data folder**               | Where the library is stored; **Browse...**, **Use default location** and **Open current folder** move or reveal it | App data folder |
| **Backend port** (Advanced)   | The internal Web API port                                     | 38080   |
| **Database port** (Advanced)  | The internal PostgreSQL port                                  | 35432   |
| **Worker processes** (Advanced) | How many asset-processor workers run                        | Half your CPU cores, capped at 2 |
| **Jobs per worker** (Advanced) | How many jobs each worker runs at once                       | 3       |
| **Hardware acceleration** (Advanced) | Use GPU rendering instead of software rendering        | Off     |
| **Allow access from my network** (Advanced) | Serve the app to other devices on your network    | Off     |

Changing the ports, the data folder or network access needs a restart - a
**Restart to apply** button appears. Worker count and hardware acceleration apply
live.

## The data folder

Your uploads, thumbnails, PostgreSQL data and Blender install live under the data
folder. Moving it is queued: the host copies everything to the new location on
the **next launch**, and it never overwrites an existing library there. The old
folder is left on disk as a backup, and the status window shows a notice to
**Open folder** or **Dismiss** it - safe to delete once you have confirmed
everything moved.

You can also reach it any time from the tray's **Open Data Folder**.

## Local network access over HTTPS

Turn on **Allow access from my network** to let another device (a phone, or a
desktop client on another computer) reach this host. Off by default, and
Modelibr has no password, so only enable it for networks you trust.

When it is on:

- On the machine itself, the app keeps working at plain
  `http://127.0.0.1:3010`.
- On the network it is served over **HTTPS** with a self-signed certificate the
  host generates for you, at the `https://...` address the status window shows.
- The first device to open it gets a **one-time certificate warning**; accept it
  to continue. You can also download and trust the certificate from
  **Settings -> SSL Certificate** to stop the warning entirely. See
  [Troubleshooting](/docs/features/troubleshooting).

## Start on login

Under **Settings -> Desktop**, turn on **Start on login** to launch Modelibr when
you sign in to this computer. It is off by default and applies on macOS and
Windows; Linux has no login-item support.

## Updates

The host checks GitHub Releases on launch and shows an update prompt in the tray
and the status window. Nothing downloads or installs without your choice:
installing always finishes with a **Restart & Install**.

Under **Settings -> Desktop**, **Download updates automatically** (off by
default) lets an available update download in the background instead - installing
still stays your choice. On macOS, an unsigned build cannot auto-install, so the
host falls back to opening the releases page.

## Blender

The host does **not** look for a Blender you already have installed. Blender is
optional and installed at runtime from **Settings -> Blender**, which manages one
version inside the data folder - see [Settings](/docs/features/settings).
Operations that need Blender stay unavailable until it is installed; see
[Troubleshooting](/docs/features/troubleshooting) if a Blender run fails.

## The desktop Client

The **Modelibr Client** is a separate installer that opens a **running host** in
its own window. It ships no runtime of its own.

- It connects to `http://127.0.0.1:3010` by default. **Connection Settings...**
  opens a screen with a **Host** and a **Port**, so it can point at a host on
  another computer on your network.
- If it cannot reach the host, it shows a connection page explaining that the
  host may be off or its port may have changed, with **Retry** and **Connect**.
- It has its own update channel: **Check for Updates...** is opt-in, and a new
  version only installs when you choose **Restart & Install**.

The host can install the Client for you from the status window's **Desktop
client** row.
