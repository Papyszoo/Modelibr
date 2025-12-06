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
        var uri = $"modelibr://open?modelId={modelId}";
        
        if (versionId.HasValue)
        {
            uri += $"&versionId={versionId.Value}";
        }

        return Results.Ok(new { uri });
    }
}
