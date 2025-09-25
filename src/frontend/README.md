# Modelibr Frontend

A modern React frontend for the Modelibr 3D model upload service.

## Features

- Clean, responsive UI for 3D model file uploads
- Support for common 3D file formats (OBJ, FBX, DAE, 3DS, Blender, glTF/GLB)
- Real-time upload status feedback
- Dockerized deployment with nginx for production
- Comprehensive test suite with Jest and React Testing Library

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Testing

The frontend includes a comprehensive test suite covering:

- Utility functions (file validation, formatting)
- React components (ModelInfo, LoadingPlaceholder)
- API client interfaces
- Drag and drop functionality

See [TESTING.md](./TESTING.md) for detailed testing documentation.

## Docker

The frontend is containerized and can be run in either development or production mode:

- **Production**: Uses nginx to serve static files built by Vite
- **Development**: Runs the Vite development server with hot reloading

Access the frontend at http://localhost:3000 when running via Docker Compose.

## API Integration

The frontend connects to the WebAPI service running on port 8080 to upload 3D model files via the `/uploadModel` endpoint.
