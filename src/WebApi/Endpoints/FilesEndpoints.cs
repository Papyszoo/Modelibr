using Application.Abstractions.Messaging;
using Application.Files;
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

        app.MapGet("/files/{id}", async (int id, IQueryHandler<GetFileQuery, GetFileQueryResponse> queryHandler) =>
        {
            var result = await queryHandler.Handle(new GetFileQuery(id), CancellationToken.None);
            
            if (!result.IsSuccess)
            {
                return Results.NotFound(result.Error.Message);
            }

            var fileStream = System.IO.File.OpenRead(result.Value.FullPath);
            var contentType = ContentTypeProvider.GetContentType(result.Value.OriginalFileName);
            
            return Results.File(fileStream, contentType, result.Value.OriginalFileName, enableRangeProcessing: true);
        })
        .WithName("Get File");
    }

    private static async Task<IResult> UploadFile(
        IFormFile file, 
        ICommandHandler<UploadFileCommand, UploadFileCommandResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var validationResult = ValidateFile(file);
        if (!validationResult.IsSuccess)
        {
            return Results.BadRequest(new { error = validationResult.Error.Code, message = validationResult.Error.Message });
        }

        var result = await commandHandler.Handle(new UploadFileCommand(new FormFileUpload(file)), cancellationToken);

        if (!result.IsSuccess)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static Result ValidateFile(IFormFile file)
    {
        if (file.Length <= 0)
        {
            return Result.Failure(new Error("InvalidFile", "File is empty or invalid."));
        }

        if (file.Length > 1_073_741_824) // 1GB
        {
            return Result.Failure(new Error("FileTooLarge", "File size cannot exceed 1GB."));
        }

        return Result.Success();
    }
}