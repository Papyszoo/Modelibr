# Modelibr

[![.NET](https://img.shields.io/badge/.NET-9.0-blue)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React-18+-blue)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-Latest-orange)](https://threejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue)](https://www.docker.com/)

A comprehensive 3D model management platform that helps you organize, preview, and manage your 3D assets with ease. Upload models, create texture sets, organize into projects, and preview everything in an interactive 3D viewer.

## ✨ What Can Modelibr Do For You?

**Manage Your 3D Assets**
- Upload 3D models in popular formats (OBJ, FBX, GLTF, DAE, Blender, 3DS)
- Get automatic animated thumbnails for quick preview
- Never store the same file twice with intelligent deduplication
- Tag and categorize models for easy searching

**Organize Your Work**
- Create Projects to group related models and textures
- Build Packs for distributing asset collections
- Track your upload history
- Save and reuse scene configurations

**Work With Materials**
- Create Texture Sets with PBR materials (Albedo, Normal, Metallic, Roughness, and more)
- Preview materials in real-time on different shapes (sphere, cube, plane, etc.)
- Link textures to models for consistent rendering
- Adjust material properties with instant visual feedback

**Interactive 3D Viewing**
- View models in a full-featured 3D viewer
- Orbit, zoom, and pan around your models
- See models with applied materials and lighting
- Save favorite camera angles and lighting setups

## 🌟 Key Features

- **Drag-and-Drop Upload** - Simply drag your 3D model files into the browser
- **Animated Thumbnails** - Every model gets an automatic 360° rotating preview
- **Project Organization** - Group your models and textures into logical projects
- **Material Preview** - See exactly how your textures will look in real-time
- **Smart Storage** - Duplicate files are automatically detected and shared
- **Scene Presets** - Save your favorite camera and lighting configurations
- **Multi-Format Support** - Works with all major 3D file formats
- **Web-Based** - Access from any modern browser, no installation needed

## 📸 Screenshots

> **📝 Note**: Screenshots are being updated to showcase the application features.

## 🚀 Getting Started

### Quick Start with Docker

The easiest way to run Modelibr is using Docker. You don't need to install any dependencies - Docker handles everything.

1. **Get the code**
   ```bash
   git clone https://github.com/Papyszoo/Modelibr.git
   cd Modelibr
   ```

2. **Configure settings**
   ```bash
   cp .env.example .env
   # Edit .env if you want to change default ports or passwords
   ```

3. **Start the application**
   ```bash
   docker compose up -d
   ```

4. **Open your browser**
   - Go to http://localhost:3000 to access Modelibr
   - Start uploading and managing your 3D models!

That's it! The application is now running with all features enabled.

### Stopping the Application

```bash
docker compose down
```

### Updating to Latest Version

```bash
git pull
docker compose up -d --build
```

## 🛠️ Technology Stack

Modelibr is built with modern, proven technologies:

**Backend**
- .NET 9.0
- PostgreSQL database
- REST API

**Frontend**
- React 18+
- Three.js for 3D rendering
- Modern responsive UI

**Infrastructure**
- Docker for easy deployment
- Automated thumbnail generation
- Real-time updates

## 📁 Supported File Formats

Upload 3D models in these popular formats:

| Format | Extension | Common Use |
|--------|-----------|------------|
| Wavefront OBJ | `.obj` | Most widely supported format |
| Autodesk FBX | `.fbx` | Animation and rigging |
| COLLADA | `.dae` | Universal interchange format |
| glTF/GLB | `.gltf`, `.glb` | Web-optimized format |
| 3D Studio Max | `.3ds` | Legacy 3D Studio files |
| Blender | `.blend` | Native Blender format |

## 💡 Usage Tips

**Getting the Most Out of Modelibr**

1. **Upload Models** - Drag and drop your 3D files into the upload area
2. **Create Projects** - Group related models together for better organization
3. **Add Textures** - Upload texture images and create material sets
4. **Preview Everything** - Use the 3D viewer to inspect models and materials
5. **Save Presets** - Save your favorite camera angles and lighting for quick access
6. **Tag Models** - Add descriptive tags to make models easy to find later

**Working with Large Collections**

- Use Projects to organize models by client, project, or category
- Create Packs when you need to bundle assets for distribution
- Let the system handle duplicates - it automatically shares identical files
- Upload history helps you track when and what was uploaded

## 🔧 Configuration

The application uses environment variables for configuration. Edit the `.env` file to customize:

**Main Settings**
```bash
# Ports
FRONTEND_PORT=3000          # Web interface port
WEBAPI_HTTP_PORT=8080      # API port

# Database
POSTGRES_USER=modelibr
POSTGRES_PASSWORD=ChangeThisStrongPassword123!
POSTGRES_PORT=5432

# Storage
UPLOAD_STORAGE_PATH=/var/lib/modelibr/uploads
```

For advanced configuration options, see `.env.example` in the repository.

## ❓ Common Questions

**Q: Do I need to install anything besides Docker?**
A: No! Docker includes everything needed to run Modelibr.

**Q: Can I use this for commercial projects?**
A: Yes, Modelibr is open source under the MIT license.

**Q: How much disk space do I need?**
A: It depends on your model collection size. The app uses smart deduplication to save space.

**Q: Can multiple users access the same instance?**
A: Yes, Modelibr works great for teams sharing the same server.

**Q: What if I need help?**
A: Check the Troubleshooting section below or open an issue on GitHub.

## 🔧 Troubleshooting

### Docker Issues

**Container won't start or is unhealthy**
- Check if Docker is running: `docker ps`
- View logs: `docker compose logs`
- Restart containers: `docker compose restart`

**Port already in use**
- Change ports in `.env` file
- Default ports: 3000 (web), 8080 (API), 5432 (database)

**Can't upload files**
- Check disk space
- Verify upload directory permissions

**Thumbnails not generating**
- Check worker logs: `docker compose logs thumbnail-worker`
- Restart worker: `docker compose restart thumbnail-worker`

### Getting Help

- Check existing [GitHub Issues](https://github.com/Papyszoo/Modelibr/issues)
- Review documentation in the `/docs` folder
- Open a new issue with details about your problem

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) for powerful 3D rendering capabilities
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) for React integration
- [ASP.NET Core](https://docs.microsoft.com/en-us/aspnet/core/) for the robust backend framework
- [Entity Framework Core](https://docs.microsoft.com/en-us/ef/core/) for data access
- [Storybook](https://storybook.js.org/) for component documentation and development

---

