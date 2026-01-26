using Application.Abstractions.Messaging;
using Application.Sounds;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class SoundEndpoints
{
    public static void MapSoundEndpoints(this IEndpointRouteBuilder app)
    {
        // CRUD operations
        app.MapGet("/sounds", GetAllSounds)
            .WithName("Get All Sounds")
            .WithSummary("Gets all sounds with their file and category information")
            .WithOpenApi();

        app.MapGet("/sounds/{id}", GetSoundById)
            .WithName("Get Sound By ID")
            .WithSummary("Gets a specific sound by ID")
            .WithOpenApi();

        app.MapPost("/sounds", CreateSound)
            .WithName("Create Sound")
            .WithSummary("Creates a new sound")
            .WithOpenApi();

        app.MapPost("/sounds/with-file", CreateSoundWithFile)
            .WithName("Create Sound With File")
            .WithSummary("Creates a new sound and uploads a file in one operation")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapPut("/sounds/{id}", UpdateSound)
            .WithName("Update Sound")
            .WithSummary("Updates an existing sound")
            .WithOpenApi();

        app.MapDelete("/sounds/{id}", DeleteSound)
            .WithName("Delete Sound")
            .WithSummary("Deletes a sound")
            .WithOpenApi();

        app.MapDelete("/sounds/{id}/soft", SoftDeleteSound)
            .WithName("Soft Delete Sound")
            .WithSummary("Soft deletes a sound (marks as deleted)")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllSounds(
        int? packId,
        int? projectId,
        int? categoryId,
        IQueryHandler<GetAllSoundsQuery, GetAllSoundsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllSoundsQuery(packId, projectId, categoryId), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetSoundById(
        int id,
        IQueryHandler<GetSoundByIdQuery, GetSoundByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetSoundByIdQuery(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value.Sound);
    }

    private static async Task<IResult> CreateSound(
        [FromBody] CreateSoundRequest request,
        ICommandHandler<CreateSoundCommand, CreateSoundResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Sound name is required." });
        }

        var result = await commandHandler.Handle(
            new CreateSoundCommand(request.Name, request.FileId, request.Duration, request.Peaks, request.CategoryId),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/sounds/{result.Value.Id}", result.Value);
    }

    private static async Task<IResult> CreateSoundWithFile(
        IFormFile file,
        string? name,
        double? duration,
        string? peaks,
        int? categoryId,
        string? batchId,
        int? packId,
        int? projectId,
        ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "File is required." });
        }

        // Use file name without extension as default sound name
        var soundName = name ?? Path.GetFileNameWithoutExtension(file.FileName);
        var soundDuration = duration ?? 0;

        var result = await commandHandler.Handle(
            new CreateSoundWithFileCommand(
                new WebApi.Files.FormFileUpload(file),
                soundName,
                soundDuration,
                peaks,
                categoryId,
                batchId,
                packId,
                projectId),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/sounds/{result.Value.SoundId}", result.Value);
    }

    private static async Task<IResult> UpdateSound(
        int id,
        [FromBody] UpdateSoundRequest request,
        ICommandHandler<UpdateSoundCommand, UpdateSoundResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateSoundCommand(id, request.Name, request.CategoryId),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> DeleteSound(
        int id,
        ICommandHandler<DeleteSoundCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteSoundCommand(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> SoftDeleteSound(
        int id,
        ICommandHandler<SoftDeleteSoundCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new SoftDeleteSoundCommand(id), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

// Request DTOs
public record CreateSoundRequest(string Name, int FileId, double Duration, string? Peaks, int? CategoryId = null);
public record UpdateSoundRequest(string? Name, int? CategoryId);
