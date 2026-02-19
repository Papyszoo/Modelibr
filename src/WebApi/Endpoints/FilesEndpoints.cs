using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Files;
using SharedKernel;
using WebApi.Files;
using WebApi.Infrastructure;
using WebApi.Services;

namespace WebApi.Endpoints;

public static class FilesEndpoints
{
    public static void MapFilesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/files", UploadFile)
            .WithName("Upload File")
            .WithSummary("Uploads a file (texture, model, etc.) without associating it to a model")
            .DisableAntiforgery();

        app.MapGet("/files/{id}", async (int id, IQueryHandler<GetFileQuery, GetFileQueryResponse> queryHandler, CancellationToken cancellationToken) =>
        {
            var result = await queryHandler.Handle(new GetFileQuery(id), cancellationToken);
            
            if (result.IsFailure)
            {
                return Results.NotFound(result.Error.Message);
            }

            var fileStream = System.IO.File.OpenRead(result.Value.FullPath);
            var contentType = ContentTypeProvider.GetContentType(result.Value.OriginalFileName);
            
            return Results.File(fileStream, contentType, result.Value.OriginalFileName, enableRangeProcessing: true);
        })
        .WithName("Get File");

        app.MapGet("/files/{id}/preview", ServeFilePreview)
            .WithName("Get File Preview")
            .WithSummary("Serves a lightweight PNG preview for large or exotic-format files");

        app.MapPost("/files/{id}/preview/upload", UploadFilePreview)
            .WithName("Upload File Preview")
            .WithSummary("Uploads a PNG preview for a file (used by the worker)")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .DisableAntiforgery();
    }

    private static async Task<IResult> ServeFilePreview(
        int id,
        string? channel,
        IQueryHandler<GetFileQuery, GetFileQueryResponse> queryHandler,
        IFilePreviewService previewService,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetFileQuery(id), cancellationToken);
        if (result.IsFailure)
            return Results.NotFound();

        // Extract SHA256 hash from the storage path (filename is the hash)
        var sha256Hash = Path.GetFileName(result.Value.FullPath);
        
        // Support channel-specific previews (rgb, r, g, b)
        var effectiveChannel = string.IsNullOrWhiteSpace(channel) ? "rgb" : channel.ToLowerInvariant();
        var previewPath = effectiveChannel == "rgb" 
            ? previewService.GetPreviewPath(sha256Hash) 
            : previewService.GetPreviewPath(sha256Hash, effectiveChannel);
        
        if (previewPath == null)
            return Results.NotFound();

        return Results.File(previewPath, "image/png");
    }

    private static async Task<IResult> UploadFilePreview(
        int id,
        IFormFile file,
        IQueryHandler<GetFileQuery, GetFileQueryResponse> queryHandler,
        IFilePreviewService previewService,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetFileQuery(id), cancellationToken);
        if (result.IsFailure)
            return Results.NotFound();

        var sha256Hash = Path.GetFileName(result.Value.FullPath);
        await using var stream = file.OpenReadStream();
        await previewService.SavePreviewAsync(sha256Hash, stream, cancellationToken);

        return Results.Ok(new { message = "Preview uploaded", fileId = id });
    }

    private static async Task<IResult> UploadFile(
        IFormFile file,
        string? batchId,
        string? uploadType,
        int? packId,
        int? modelId,
        int? textureSetId,
        ICommandHandler<UploadFileCommand, UploadFileCommandResponse> commandHandler,
        Application.Settings.ISettingsService settingsService,
        CancellationToken cancellationToken)
    {
        var settings = await settingsService.GetSettingsAsync(cancellationToken);
        var validationResult = ValidateFile(file, settings.MaxFileSizeBytes);
        if (validationResult.IsFailure)
        {
            return Results.BadRequest(new { error = validationResult.Error.Code, message = validationResult.Error.Message });
        }

        var result = await commandHandler.Handle(
            new UploadFileCommand(
                new FormFileUpload(file),
                batchId,
                uploadType,
                packId,
                modelId,
                textureSetId),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static Result ValidateFile(IFormFile file, long maxFileSizeBytes)
    {
        if (file.Length <= 0)
        {
            return Result.Failure(new Error("InvalidFile", "File is empty or invalid."));
        }

        if (file.Length > maxFileSizeBytes)
        {
            var maxSizeMB = maxFileSizeBytes / 1_048_576;
            return Result.Failure(new Error("FileTooLarge", $"File size cannot exceed {maxSizeMB}MB."));
        }

        return Result.Success();
    }
}