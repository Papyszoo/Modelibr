using Application.Abstractions.Messaging;
using Application.Files;
using Microsoft.Net.Http.Headers;
using SharedKernel;
using WebApi.Files;
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

        app.MapGet("/files/{id}", async (int id, HttpContext httpContext, IQueryHandler<GetFileQuery, GetFileQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetFileQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(result.Error.Message);
            }

            var response = result.Value;
            var etag = new EntityTagHeaderValue($"\"{response.Sha256Hash}\"");
            
            // Check If-None-Match header for cache validation
            if (httpContext.Request.Headers.TryGetValue("If-None-Match", out var ifNoneMatch) &&
                ifNoneMatch.ToString().Contains(response.Sha256Hash))
            {
                return Results.StatusCode(StatusCodes.Status304NotModified);
            }

            var fileStream = System.IO.File.OpenRead(response.FullPath);
            var contentType = ContentTypeProvider.GetContentType(response.OriginalFileName);
            
            // Set cache headers - require revalidation with ETag
            httpContext.Response.Headers.CacheControl = "no-cache";
            httpContext.Response.Headers.ETag = etag.ToString();
            
            return Results.File(fileStream, contentType, response.OriginalFileName, enableRangeProcessing: true);
        })
        .WithName("Get File");
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
        if (!validationResult.IsSuccess)
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

        if (!result.IsSuccess)
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