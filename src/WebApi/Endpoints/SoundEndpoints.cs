using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Sounds;
using Application.Files;
using Microsoft.AspNetCore.Mvc;
using WebApi.Services;

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

        app.MapGet("/sounds/{id}/file", GetSoundFile)
            .WithName("Get Sound File")
            .WithSummary("Gets the sound file data for processing")
            .WithOpenApi();

        app.MapPost("/sounds/{id}/waveform/upload", UploadWaveform)
            .WithName("Upload Waveform Thumbnail")
            .WithSummary("Uploads a waveform thumbnail PNG for a sound (called by worker service)")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapGet("/sounds/{id}/waveform", GetWaveform)
            .WithName("Get Waveform Thumbnail")
            .WithSummary("Gets the waveform thumbnail image for a sound")
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

    private static async Task<IResult> GetSoundFile(
        int id,
        IQueryHandler<GetSoundByIdQuery, GetSoundByIdResponse> soundQueryHandler,
        IQueryHandler<GetFileQuery, GetFileQueryResponse> fileQueryHandler,
        CancellationToken cancellationToken)
    {
        // First get the sound to retrieve its FileId
        var soundResult = await soundQueryHandler.Handle(new GetSoundByIdQuery(id), cancellationToken);
        if (!soundResult.IsSuccess)
        {
            return Results.NotFound(new { error = soundResult.Error.Code, message = soundResult.Error.Message });
        }

        var fileId = soundResult.Value.Sound.FileId;

        // Now get the actual file
        var fileResult = await fileQueryHandler.Handle(new GetFileQuery(fileId), cancellationToken);
        if (!fileResult.IsSuccess)
        {
            return Results.NotFound(new { error = fileResult.Error.Code, message = fileResult.Error.Message });
        }

        var fileStream = System.IO.File.OpenRead(fileResult.Value.FullPath);
        var contentType = ContentTypeProvider.GetContentType(fileResult.Value.OriginalFileName);

        return Results.File(fileStream, contentType, fileResult.Value.OriginalFileName, enableRangeProcessing: true);
    }

    private static async Task<IResult> UploadWaveform(
        int id,
        IFormFile file,
        [FromForm] string? soundHash,
        IQueryHandler<GetSoundByIdQuery, GetSoundByIdResponse> soundQueryHandler,
        ILogger<Program> logger,
        CancellationToken cancellationToken)
    {
        try
        {
            // Verify sound exists
            var soundResult = await soundQueryHandler.Handle(new GetSoundByIdQuery(id), cancellationToken);
            if (!soundResult.IsSuccess)
            {
                return Results.NotFound(new { error = soundResult.Error.Code, message = soundResult.Error.Message });
            }

            // Validate file
            if (file == null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "InvalidFile", message = "No file provided or file is empty." });
            }

            if (!file.ContentType.StartsWith("image/png"))
            {
                return Results.BadRequest(new { error = "InvalidFileType", message = "File must be a PNG image." });
            }

            // For now, we'll save the waveform to the uploads directory with the sound hash
            // In a full implementation, this should use a dedicated storage service
            var uploadsPath = Environment.GetEnvironmentVariable("UPLOAD_STORAGE_PATH") ?? "/var/lib/modelibr/uploads";
            var soundHashDirectory = soundHash ?? soundResult.Value.Sound.FileId.ToString();
            var waveformDirectory = Path.Combine(uploadsPath, "waveforms", soundHashDirectory);
            Directory.CreateDirectory(waveformDirectory);

            var waveformPath = Path.Combine(waveformDirectory, "waveform.png");
            
            using (var stream = new FileStream(waveformPath, FileMode.Create))
            {
                await file.CopyToAsync(stream, cancellationToken);
            }

            var fileInfo = new FileInfo(waveformPath);
            var relativePath = $"waveforms/{soundHashDirectory}/waveform.png";

            logger.LogInformation("Waveform thumbnail uploaded successfully for sound {SoundId} to {Path}", 
                id, relativePath);

            return Results.Ok(new
            {
                Message = "Waveform uploaded successfully",
                SoundId = id,
                StoragePath = relativePath,
                SizeBytes = fileInfo.Length
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to upload waveform for sound {SoundId}", id);
            return Results.Problem(
                title: "Upload Failed",
                detail: ex.Message,
                statusCode: 500
            );
        }
    }

    private static async Task<IResult> GetWaveform(
        int id,
        IQueryHandler<GetSoundByIdQuery, GetSoundByIdResponse> soundQueryHandler,
        IQueryHandler<GetFileQuery, GetFileQueryResponse> fileQueryHandler,
        IFileRepository fileRepository,
        CancellationToken cancellationToken)
    {
        // Get the sound to retrieve file hash
        var soundResult = await soundQueryHandler.Handle(new GetSoundByIdQuery(id), cancellationToken);
        if (!soundResult.IsSuccess)
        {
            return Results.NotFound(new { error = soundResult.Error.Code, message = soundResult.Error.Message });
        }

        // Get the file entity to get the hash
        var file = await fileRepository.GetByIdAsync(soundResult.Value.Sound.FileId, cancellationToken);
        if (file == null)
        {
            return Results.NotFound(new { error = "FileNotFound", message = "Sound file not found." });
        }

        // Build waveform path
        var uploadsPath = Environment.GetEnvironmentVariable("UPLOAD_STORAGE_PATH") ?? "/var/lib/modelibr/uploads";
        var waveformPath = Path.Combine(uploadsPath, "waveforms", file.Sha256Hash, "waveform.png");

        if (!System.IO.File.Exists(waveformPath))
        {
            return Results.NotFound(new { error = "WaveformNotFound", message = "Waveform thumbnail has not been generated yet." });
        }

        var fileStream = System.IO.File.OpenRead(waveformPath);
        return Results.File(fileStream, "image/png", "waveform.png");
    }
}

// Request DTOs
public record CreateSoundRequest(string Name, int FileId, double Duration, string? Peaks, int? CategoryId = null);
public record UpdateSoundRequest(string? Name, int? CategoryId);
