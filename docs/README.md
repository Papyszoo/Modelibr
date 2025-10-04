# Documentation and Sample Files

This directory contains documentation and sample files for the Modelibr project.

## API Documentation

### Backend API
- **[Backend API Documentation](./backend/README.md)** - Complete REST API reference
- **[Quick Reference](./backend/QUICK_REFERENCE.md)** - Quick API reference guide

The backend documentation includes:
- All API endpoints with detailed descriptions
- Request/response examples in cURL, JavaScript, and Python
- Authentication and authorization details
- Error handling and status codes
- File type support and validation rules
- Real-time updates with SignalR
- Worker API for background jobs

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