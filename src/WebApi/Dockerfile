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
COPY ["src/WebApi/WebApi.csproj", "src/WebApi/"]
COPY ["src/Application/Application.csproj", "src/Application/"]
COPY ["src/Domain/Domain.csproj", "src/Domain/"]
COPY ["src/SharedKernel/SharedKernel.csproj", "src/SharedKernel/"]
COPY ["src/Infrastructure/Infrastructure.csproj", "src/Infrastructure/"]
RUN dotnet restore "./src/WebApi/WebApi.csproj"
COPY . .
WORKDIR "/src/src/WebApi"
RUN dotnet build "./WebApi.csproj" -c $BUILD_CONFIGURATION -o /app/build

# Publish stage
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./WebApi.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# Final stage
FROM base AS final
# Allow customizing UID/GID to match host for bind-mounted uploads directory
ARG APP_UID=1000
ARG APP_GID=1000
# Create app user/group and data directories
RUN groupadd -g $APP_GID app && \
    useradd -u $APP_UID -g app -m -d /home/app app && \
    mkdir -p /var/lib/modelibr/uploads && \
    chown -R app:app /var/lib/modelibr
# Copy published output
COPY --from=publish /app/publish .
# Ensure app files owned by non-root user
RUN chown -R app:app /app
ENV UPLOAD_STORAGE_PATH=/var/lib/modelibr/uploads
USER app
ENTRYPOINT ["dotnet", "WebApi.dll"]