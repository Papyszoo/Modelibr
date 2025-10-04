# Documentation and Sample Files

This directory contains documentation and sample files for the Modelibr project.

## Documentation

### [Worker Service Documentation](worker/)
Comprehensive documentation for the thumbnail worker service:
- **[Overview & Architecture](worker/index.md)** - Service architecture, technology stack, and processing pipeline
- **[Files & Responsibilities](worker/files-and-responsibilities.md)** - Detailed documentation of all source files
- **[Service Communication](worker/service-communication.md)** - SignalR and HTTP API integration
- **[Configuration](worker/configuration.md)** - Complete environment variable reference
- **[Deployment](worker/deployment.md)** - Docker, Kubernetes, and production deployment guides
- **[Troubleshooting](worker/troubleshooting.md)** - Common issues and solutions

### [Worker API Integration](worker-api-integration.md)
Documentation on the API-based thumbnail storage approach that eliminates filesystem permission issues.

## Sample Files

### sample-cube.obj
A simple cube in Wavefront OBJ format that can be used to test the 3D model upload functionality. This file demonstrates:
- Basic OBJ format structure
- Vertices, texture coordinates, and normals
- Face definitions with material references

To test with this file:
1. Start the Modelibr application
2. Navigate to the upload interface
3. Select `sample-cube.obj` from this directory
4. Upload and view the model in the 3D viewer

## File Format Examples

The sample files in this directory demonstrate the supported 3D file formats:
- `.obj` - Wavefront OBJ (text-based, widely supported)
- Additional samples for other formats can be added here

## Usage

These files are meant for:
- Testing the upload functionality
- Demonstrating supported file formats
- Providing examples for developers
- Quality assurance and validation