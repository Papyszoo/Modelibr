# Dockerfile for containerizing the WebApi application

# Runtime base
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

# Update CA certificates and configure for NuGet SSL issues
RUN apt-get update && apt-get install -y ca-certificates curl && update-ca-certificates
# Configure .NET to use system SSL certificates and bypass SSL verification if needed
ENV DOTNET_SYSTEM_NET_HTTP_USESOCKETSHTTPHANDLER=0
ENV NUGET_CERT_REVOCATION_MODE=offline

COPY ["src/WebApi/WebApi.csproj", "src/WebApi/"]
COPY ["src/Application/Application.csproj", "src/Application/"]
COPY ["src/Domain/Domain.csproj", "src/Domain/"]
COPY ["src/SharedKernel/SharedKernel.csproj", "src/SharedKernel/"]
COPY ["src/Infrastructure/Infrastructure.csproj", "src/Infrastructure/"]
# Restore packages with retry logic for SSL issues
RUN dotnet restore "./src/WebApi/WebApi.csproj" --disable-parallel || \
    dotnet restore "./src/WebApi/WebApi.csproj" --disable-parallel --ignore-failed-sources
COPY . .
WORKDIR "/src/src/WebApi"
RUN dotnet build "./WebApi.csproj" -c $BUILD_CONFIGURATION -o /app/build

# Publish stage
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./WebApi.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# Final stage
FROM base AS final
# Install curl for healthchecks
USER root
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
# Allow customizing UID/GID to match host for bind-mounted uploads directory
ARG APP_UID=1000
ARG APP_GID=1000
# Create app user/group and data directories with full permissions
RUN groupadd -g $APP_GID app || true && \
    useradd -u $APP_UID -g app -m -d /home/app app || true && \
    mkdir -p /var/lib/modelibr/uploads && \
    chmod -R 755 /var/lib/modelibr && \
    chown -R app:app /var/lib/modelibr
# Copy published output
COPY --from=publish /app/publish .
# Ensure app files owned by non-root user with proper permissions
RUN chown -R app:app /app && \
    chmod -R 755 /app
ENV UPLOAD_STORAGE_PATH=/var/lib/modelibr/uploads
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1
ENV DOTNET_EnableDiagnostics=0
USER app
ENTRYPOINT ["dotnet", "WebApi.dll"]
