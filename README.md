# Modelibr

[![.NET](https://img.shields.io/badge/.NET-9.0-512BD4)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.180-000000)](https://threejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## Your Personal 3D Asset Library

**Self-hosted. Open source. No cloud required.**

Organize, preview, and manage your 3D models with automatic animated thumbnails, version control, and seamless Blender integration. All on your own hardware, 100% offline.

📚 **[Documentation](https://Papyszoo.github.io/Modelibr/)** | 💬 **[Discord](https://discord.gg/KgwgTDVP3F)**

---

## ✨ Key Features

| Feature                 | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| **Animated Thumbnails** | Every model gets a rotating 360° preview automatically      |
| **Version Control**     | Keep multiple versions of each model, rollback anytime      |
| **Texture Sets**        | PBR materials with real-time preview on customizable shapes |
| **Smart Deduplication** | Same file uploaded twice? Storage is shared automatically   |
| **Self-Hosted**         | Your data stays on your hardware. Works 100% offline        |

---

## 🚀 Quick Start

### 1. Run with Docker

```bash
git clone https://github.com/Papyszoo/Modelibr.git
cd Modelibr
cp .env.example .env
docker compose up -d
```

### 2. Access the App

Open **http://localhost:3000** in your browser.

### 3. Start Uploading

Drag and drop your 3D models into the browser. That's it!

---

## 🎯 Who Is This For?

- **3D Artists** — Visual library with search, tags, and automatic thumbnails
- **Game Dev Teams** — Self-hosted server everyone on your team can access
- **Hobbyists** — Organize, preview, and rediscover your collection

---

## 📁 Supported Formats

| Format        | Extension | Preview                        |
| ------------- | --------- | ------------------------------ |
| glTF Binary   | `.glb`    | ✅                             |
| glTF          | `.gltf`   | ✅                             |
| Autodesk FBX  | `.fbx`    | ✅                             |
| Wavefront OBJ | `.obj`    | ✅                             |
| Blender       | `.blend`  | Extract .glb using blender CLI |

---

## 🛠️ Tech Stack

| Layer              | Technologies                         |
| ------------------ | ------------------------------------ |
| **Frontend**       | React 18, Three.js 0.180, TypeScript |
| **Backend**        | .NET 9.0, PostgreSQL, REST API       |
| **Infrastructure** | Docker, Automated thumbnails         |

---

## 🤝 Contributing

**All contributions and feature requests are welcome!**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Have an idea? [Open an issue](https://github.com/Papyszoo/Modelibr/issues) or join our [Discord](https://discord.gg/KgwgTDVP3F) to discuss!

---

## 📝 License

MIT License — see [LICENSE](LICENSE) for details.

---

**[📚 Full Documentation](https://Papyszoo.github.io/Modelibr/)** | **[💬 Join Discord](https://discord.gg/KgwgTDVP3F)** | **[⭐ Star on GitHub](https://github.com/Papyszoo/Modelibr)**
