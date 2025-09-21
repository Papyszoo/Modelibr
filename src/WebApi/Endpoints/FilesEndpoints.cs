using Application.Abstractions.Messaging;
using Application.Files;
using WebApi.Services;

namespace WebApi.Endpoints;

public static class FilesEndpoints
{
    public static void MapFilesEndpoints(this IEndpointRouteBuilder app)
    {
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
}