# Development Environment Setup

This document provides comprehensive instructions for setting up the Modelibr development environment.

## Quick Start (Recommended)

### Option 1: Full Docker Compose (May have certificate issues in some environments)

```bash
# 1. Clone and configure
git clone https://github.com/Papyszoo/Modelibr.git
cd Modelibr
cp .env.example .env

# 2. Build frontend assets first (required for production build)
cd src/frontend
npm install
npm run build
cd ../..

# 3. Start all services
docker compose up --build
```

### Option 2: Local Development + Docker Database (Recommended for development)

```bash
# 1. Clone and configure
git clone https://github.com/Papyszoo/Modelibr.git
cd Modelibr
cp .env.example .env

# 2. Install .NET 9.0 SDK (if not already installed)
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 9.0
export PATH="$HOME/.dotnet:$PATH"

# 3. Start database only
docker compose -f docker-compose.local.yml up -d

# 4. Build and run backend locally
dotnet restore Modelibr.sln
dotnet build Modelibr.sln
cd src/WebApi
export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
dotnet run

# 5. In another terminal, run frontend
cd src/frontend
npm install
npm run dev
```

### Option 3: Full Development Mode with Hot Reloading

```bash
# 1. Setup as above
cp .env.example .env

# 2. Start development environment
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Access Points

After successful setup:

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8080  
- **API Documentation**: http://localhost:8080/openapi/v1.json (in development)
- **SQL Server**: localhost:1433 (sa/ChangeThisStrongPassword123!)

## Troubleshooting

### Certificate Issues in Docker
If you encounter SSL/certificate errors during Docker build:
- Use Option 2 (Local Development + Docker Database)
- Or build frontend assets locally first before running docker compose

### Database Connection Issues
- Ensure SQL Server container is healthy: `docker compose logs mssql`
- Wait for database initialization (can take 30-60 seconds on first run)
- Check connection string in appsettings.Development.json

### Frontend Build Issues
- Ensure Node.js 18+ is installed
- Clear node_modules: `rm -rf node_modules && npm install`
- Verify Vite configuration in vite.config.js

## Environment Variables

Key environment variables in `.env`:

- `WEBAPI_HTTP_PORT=8080` - API HTTP port
- `WEBAPI_HTTPS_PORT=8081` - API HTTPS port  
- `FRONTEND_PORT=3000` - Frontend port
- `SA_PASSWORD=ChangeThisStrongPassword123!` - SQL Server password
- `UPLOAD_STORAGE_PATH=/var/lib/modelibr/uploads` - File upload directory

## Development Workflow

1. Make code changes
2. **Backend**: Changes auto-reload with `dotnet run` or restart container
3. **Frontend**: Changes auto-reload with `npm run dev` or development container
4. **Database**: Schema changes require container restart

## Production Deployment

For production deployment, ensure:
1. Frontend is built (`npm run build`)
2. Use production environment variables
3. Configure proper SSL certificates
4. Use production database connection string