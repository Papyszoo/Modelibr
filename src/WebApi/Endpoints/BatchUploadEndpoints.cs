using Application.Abstractions.Messaging;
using Application.BatchUploads;

namespace WebApi.Endpoints;

public static class BatchUploadEndpoints
{
    public static void MapBatchUploadEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/batch-uploads/history", GetHistory)
            .WithName("Get Batch Upload History")
            .WithSummary("Retrieves the complete upload history")
            .WithOpenApi();
    }

    private static async Task<IResult> GetHistory(
        IQueryHandler<GetBatchUploadHistoryQuery, GetBatchUploadHistoryResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var query = new GetBatchUploadHistoryQuery();
        var result = await queryHandler.Handle(query, cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(result.Error);
    }
}
