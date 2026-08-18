using Application.Abstractions.Messaging;
using Application.Blender;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class BlenderEndpoints
{
    public static void MapBlenderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/blender/launch/{modelId}", GetLaunchUri)
            .WithName("Get Blender Launch URI")
            .WithTags("Blender");

        app.MapPost("/models/{modelId:int}/blender/{operation}", RequestOperation)
            .WithName("Request Blender Operation")
            .WithSummary("Queues a Blender operation (uv-unwrap, bake-textures, convert-format, mesh-analysis) on a model version")
            .WithTags("Blender")
            .WithOpenApi();

        // The queue's own row, read back. Named for the operation rather than for
        // extraction because that is what a caller polling it asked for - the table it
        // shares with re-derives is an implementation detail from out here.
        app.MapGet("/operation-jobs/{jobId:int}", GetOperationJob)
            .WithName("Get Operation Job")
            .WithSummary("Reports a queued job's status and, once it finishes, what it produced")
            .WithTags("Blender")
            .WithOpenApi();
    }

    private static async Task<IResult> RequestOperation(
        int modelId,
        string operation,
        [FromBody] RequestBlenderOperationRequest? request,
        ICommandHandler<RequestBlenderOperationCommand, BlenderOperationRequested> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(
            new RequestBlenderOperationCommand(
                modelId, operation, request?.VersionId, request?.ParametersJson),
            cancellationToken);

        if (result.IsFailure)
        {
            return result.Error.Code switch
            {
                "Blender.ModelNotFound" or "Blender.VersionNotFound" =>
                    Results.NotFound(new { error = result.Error.Code, message = result.Error.Message }),
                // Not a bad request: the call is well formed and would be accepted the
                // moment Blender is installed. 409 says "not in this state", which is what
                // an operator can actually act on.
                "Blender.NotAvailable" =>
                    Results.Conflict(new { error = result.Error.Code, message = result.Error.Message }),
                _ => Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
            };
        }

        return Results.Accepted($"/operation-jobs/{result.Value.JobId}", result.Value);
    }

    private static async Task<IResult> GetOperationJob(
        int jobId,
        IQueryHandler<GetOperationJobQuery, OperationJobView> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new GetOperationJobQuery(jobId), cancellationToken);
        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static IResult GetLaunchUri(int modelId, int? versionId = null)
    {
        if (modelId <= 0)
        {
            return Results.BadRequest(new { error = "InvalidModelId", message = "Model ID must be a positive integer." });
        }

        if (versionId.HasValue && versionId.Value <= 0)
        {
            return Results.BadRequest(new { error = "InvalidVersionId", message = "Version ID must be a positive integer." });
        }

        var uri = $"modelibr://open?modelId={modelId}";
        
        if (versionId.HasValue)
        {
            uri += $"&versionId={versionId.Value}";
        }

        return Results.Ok(new { uri });
    }
}

/// <param name="VersionId">Which version to operate on. Omitted means the model's active version.</param>
/// <param name="ParametersJson">Operation-specific inputs as a JSON object. Omitted takes every default.</param>
public record RequestBlenderOperationRequest(int? VersionId = null, string? ParametersJson = null);
