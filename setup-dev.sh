#!/bin/bash

# Modelibr Development Environment Setup Script
# This script sets up the development environment for Modelibr

set -e

echo "🚀 Setting up Modelibr Development Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if .env file exists
if [ ! -f .env ]; then
    print_status "Creating .env file from .env.example..."
    cp .env.example .env
else
    print_status ".env file already exists"
fi

# Check Docker and Docker Compose
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

print_status "Docker and Docker Compose are available"

# Check if .NET 9.0 is installed
if ! command -v dotnet &> /dev/null; then
    print_warning ".NET SDK not found. Installing .NET 9.0..."
    curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 9.0
    export PATH="$HOME/.dotnet:$PATH"
    print_status ".NET 9.0 SDK installed"
else
    DOTNET_VERSION=$(dotnet --version)
    if [[ $DOTNET_VERSION == 9.* ]]; then
        print_status ".NET 9.0 SDK is available (${DOTNET_VERSION})"
    else
        print_warning "Found .NET version ${DOTNET_VERSION}, but .NET 9.0 is recommended"
    fi
fi

# Check if Node.js is installed
if ! command -v npm &> /dev/null; then
    print_error "Node.js/npm is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node --version)
print_status "Node.js is available (${NODE_VERSION})"

# Create upload directory
print_status "Creating upload directory..."
mkdir -p data/uploads

# Choose setup method
echo ""
echo "Choose your development setup:"
echo "1) Full Docker Compose (recommended for production-like testing)"
echo "2) Local Development + Docker Database (recommended for development)"
echo "3) Just start database container (manual frontend/backend)"

read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        print_status "Setting up Full Docker Compose environment..."
        
        # Build frontend first
        print_status "Building frontend assets..."
        cd src/frontend
        npm install
        npm run build
        cd ../..
        
        # Start all services
        print_status "Starting all services with Docker Compose..."
        docker compose up --build
        ;;
        
    2)
        print_status "Setting up Local Development + Docker Database..."
        
        # Start database
        print_status "Starting SQL Server database..."
        docker compose -f docker-compose.local.yml up -d
        
        # Wait for database to be healthy
        print_status "Waiting for database to be ready..."
        sleep 15
        
        # Build .NET application
        print_status "Building .NET application..."
        export PATH="$HOME/.dotnet:$PATH"
        dotnet restore Modelibr.sln
        dotnet build Modelibr.sln
        
        # Install frontend dependencies
        print_status "Installing frontend dependencies..."
        cd src/frontend
        npm install
        cd ../..
        
        print_status "Development environment ready!"
        echo ""
        echo "To start the development servers:"
        echo "  Backend API:"
        echo "    cd src/WebApi"
        echo "    export UPLOAD_STORAGE_PATH=\"\$(pwd)/../../data/uploads\""
        echo "    export ConnectionStrings__Default=\"Server=localhost,1433;Database=Modelibr;User Id=sa;Password=ChangeThisStrongPassword123!;TrustServerCertificate=true;\""
        echo "    dotnet run"
        echo ""
        echo "  Frontend (in another terminal):"
        echo "    cd src/frontend"
        echo "    npm run dev"
        echo ""
        echo "Access points:"
        echo "  Frontend: http://localhost:3000"
        echo "  API: http://localhost:5009"
        echo "  Database: localhost:1433"
        ;;
        
    3)
        print_status "Starting database container only..."
        docker compose -f docker-compose.local.yml up -d
        
        print_status "Database started!"
        echo ""
        echo "Database connection details:"
        echo "  Host: localhost"
        echo "  Port: 1433"
        echo "  Username: sa"
        echo "  Password: ChangeThisStrongPassword123!"
        echo "  Database: Modelibr"
        ;;
        
    *)
        print_error "Invalid choice. Please run the script again."
        exit 1
        ;;
esac

print_status "Setup complete! 🎉"