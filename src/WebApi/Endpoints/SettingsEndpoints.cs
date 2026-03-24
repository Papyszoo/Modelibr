using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.Settings;

namespace WebApi.Endpoints;

public static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/settings", async (
            IQueryHandler<GetSettingsQuery, GetSettingsQueryResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetSettingsQuery(), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Get Settings")
        .WithTags("Settings");

        app.MapGet("/settings/all", async (
            IQueryHandler<GetAllSettingsQuery, GetAllSettingsQueryResponse> queryHandler,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetAllSettingsQuery(), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Get All Settings")
        .WithTags("Settings");

        app.MapPut("/settings/{key}", async (
            string key,
            UpdateSettingRequest request,
            ICommandHandler<UpdateSettingCommand, UpdateSettingResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var command = new UpdateSettingCommand(key, request.Value);
            var result = await commandHandler.Handle(command, cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Update Setting")
        .WithTags("Settings");

        app.MapPut("/settings", async (
            UpdateSettingsRequest request,
            ICommandHandler<UpdateSettingsCommand, UpdateSettingsResponse> commandHandler,
            CancellationToken cancellationToken) =>
        {
            var command = new UpdateSettingsCommand(
                request.MaxFileSizeBytes,
                request.MaxThumbnailSizeBytes,
                request.ThumbnailFrameCount,
                request.ThumbnailCameraVerticalAngle,
                request.ThumbnailWidth,
                request.ThumbnailHeight,
                request.GenerateThumbnailOnUpload,
                request.TextureProxySize
            );

            var result = await commandHandler.Handle(command, cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            return Results.Ok(result.Value);
        })
        .WithName("Update Settings")
        .WithTags("Settings");

        app.MapGet("/settings/blender-enabled", async (
            IQueryHandler<GetSettingsQuery, GetSettingsQueryResponse> queryHandler,
            IBlenderInstallationService installService,
            CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetSettingsQuery(), cancellationToken);
            if (result.IsFailure)
            {
                return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
            }

            var status = installService.GetStatus();
            var isInstalled = status.State == "installed";
            var isBlocked = status.State == "downloading" || status.State == "extracting";

            return Results.Ok(new
            {
                enableBlender = result.Value.BlenderEnabled && !isBlocked,
                blenderPath = isInstalled ? (status.InstalledPath ?? result.Value.BlenderPath) : result.Value.BlenderPath,
                settingEnabled = result.Value.BlenderEnabled,
                installed = isInstalled,
                installedVersion = status.InstalledVersion,
            });
        })
        .WithName("Get Blender Enabled")
        .WithTags("Settings");

        // ── Blender Installation Management ─────────────────────────────────

        app.MapGet("/settings/blender/versions", async (
            IBlenderInstallationService installService,
            CancellationToken cancellationToken) =>
        {
            var result = await installService.GetAvailableVersionsAsync(cancellationToken);
            return Results.Ok(new { versions = result.Versions, isOffline = result.IsOffline });
        })
        .WithName("Get Blender Versions")
        .WithTags("Settings");

        app.MapGet("/settings/blender/status", (IBlenderInstallationService installService) =>
        {
            return Results.Ok(installService.GetStatus());
        })
        .WithName("Get Blender Install Status")
        .WithTags("Settings");

        app.MapPost("/settings/blender/install", async (
            InstallBlenderRequest request,
            IBlenderInstallationService installService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                // Fire-and-forget background installation so the HTTP request returns immediately.
                // The frontend polls GET /settings/blender/status for progress.
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await installService.InstallAsync(request.Version, CancellationToken.None);
                    }
                    catch (Exception)
                    {
                        // Error is captured in status; nothing to do here.
                    }
                }, CancellationToken.None);

                // Give the service a moment to flip to "downloading" state
                await Task.Delay(100, cancellationToken);

                return Results.Ok(installService.GetStatus());
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = "InstallFailed", message = ex.Message });
            }
        })
        .WithName("Install Blender")
        .WithTags("Settings");

        app.MapPost("/settings/blender/uninstall", async (
            IBlenderInstallationService installService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                await installService.UninstallAsync(cancellationToken);
                return Results.Ok(installService.GetStatus());
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = "UninstallFailed", message = ex.Message });
            }
        })
        .WithName("Uninstall Blender")
        .WithTags("Settings");
    }
}

public record UpdateSettingRequest(string Value);

public record UpdateSettingsRequest(
    long MaxFileSizeBytes,
    long MaxThumbnailSizeBytes,
    int ThumbnailFrameCount,
    double ThumbnailCameraVerticalAngle,
    int ThumbnailWidth,
    int ThumbnailHeight,
    bool GenerateThumbnailOnUpload,
    int TextureProxySize = 512);

public record InstallBlenderRequest(string Version);
