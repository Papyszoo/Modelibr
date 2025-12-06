namespace WebApi.Endpoints;

public static class BlenderEndpoints
{
    public static void MapBlenderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/blender/launch/{modelId}", GetLaunchUri)
            .WithName("Get Blender Launch URI")
            .WithTags("Blender");
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
