using Application.Abstractions.Messaging;
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
                request.GenerateThumbnailOnUpload
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
    bool GenerateThumbnailOnUpload
);
