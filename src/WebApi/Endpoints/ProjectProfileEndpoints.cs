using Application.Abstractions.Messaging;
using Application.Projects.Profile;
using Application.Scenes;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

/// <summary>
/// The project profile (prompt 13) over REST: the vocabulary, a project's assignments, its
/// brief, and the scene ↔ project link. Mirrors of the MCP tools, so the app and an agent
/// read exactly the same thing.
/// </summary>
public static class ProjectProfileEndpoints
{
    public static void MapProjectProfileEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/projects/profile-options", GetOptions)
            .WithName("Get Project Profile Options")
            .WithSummary("The profile vocabulary: engines, platforms, genres, styles, perspectives")
            .WithOpenApi();

        app.MapPost("/projects/profile-options", CreateOption)
            .WithName("Create Project Profile Option")
            .WithSummary("Adds a vocabulary option the built-ins do not cover")
            .WithOpenApi();

        app.MapGet("/projects/{id:int}/profile", GetProfile)
            .WithName("Get Project Profile")
            .WithSummary("The project's full brief - the same one the agent is given")
            .WithOpenApi();

        app.MapPut("/projects/{id:int}/profile", SetProfile)
            .WithName("Set Project Profile")
            .WithSummary("Sets profile dimensions and the fidelity budget; an omitted dimension is left alone")
            .WithOpenApi();

        app.MapPut("/scenes/{id:int}/project", SetSceneProject)
            .WithName("Set Scene Project")
            .WithSummary("Links a scene to a project, or clears the link. Bumps the scene revision")
            .WithOpenApi();
    }

    private static async Task<IResult> GetOptions(
        [FromQuery] string? dimension,
        [FromQuery] bool? includeHidden,
        IQueryHandler<GetProjectProfileOptionsQuery, IReadOnlyList<ProjectProfileOptionDto>> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(
            new GetProjectProfileOptionsQuery(dimension, includeHidden ?? false), cancellationToken);

        return result.IsFailure
            ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(new { options = result.Value });
    }

    private static async Task<IResult> CreateOption(
        [FromBody] CreateProfileOptionRequest request,
        ICommandHandler<CreateProjectProfileOptionCommand, ProjectProfileOptionDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(
            new CreateProjectProfileOptionCommand(request.Dimension ?? string.Empty, request.Name ?? string.Empty),
            cancellationToken);

        return result.IsFailure
            ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> GetProfile(
        int id,
        IQueryHandler<GetProjectBriefQuery, ProjectBriefDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new GetProjectBriefQuery(id), cancellationToken);

        if (result.IsFailure)
        {
            return result.Error.Code == "ProjectNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> SetProfile(
        int id,
        [FromBody] SetProjectProfileRequest request,
        ICommandHandler<SetProjectProfileCommand, ProjectBriefDto> handler,
        CancellationToken cancellationToken)
    {
        var dimensions = request.Dimensions?.ToDictionary(
            entry => entry.Key,
            entry => (IReadOnlyList<ProjectProfileAssignment>)(entry.Value ?? new List<ProjectProfileAssignmentRequest>())
                .Select(a => new ProjectProfileAssignment(a.OptionId, a.Role))
                .ToList(),
            StringComparer.OrdinalIgnoreCase);

        var settings = request.Settings is null
            ? null
            : new ProjectProfileSettings(
                request.Settings.MaxTrianglesPerAsset,
                request.Settings.MaxTextureSize,
                request.Settings.TargetSceneTriangles,
                request.Settings.PixelsPerUnit,
                request.Settings.UnitsPerMetre,
                request.Settings.UpAxis,
                request.Settings.Handedness,
                request.Settings.PaletteHex);

        var result = await handler.Handle(
            new SetProjectProfileCommand(id, dimensions, settings), cancellationToken);

        if (result.IsFailure)
        {
            return result.Error.Code == "ProjectNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> SetSceneProject(
        int id,
        [FromBody] SetSceneProjectRequest request,
        ICommandHandler<SetSceneProjectCommand, SetSceneProjectResponse> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new SetSceneProjectCommand(id, request.ProjectId), cancellationToken);

        if (result.IsFailure)
        {
            return result.Error.Code is "SceneNotFound" or "ProjectNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    public sealed record CreateProfileOptionRequest(string? Dimension, string? Name);

    public sealed record ProjectProfileAssignmentRequest(int OptionId, string? Role);

    public sealed record ProjectProfileSettingsRequest(
        int? MaxTrianglesPerAsset,
        int? MaxTextureSize,
        int? TargetSceneTriangles,
        int? PixelsPerUnit,
        double? UnitsPerMetre,
        string? UpAxis,
        string? Handedness,
        List<string>? PaletteHex);

    /// <param name="Dimensions">
    /// Dimension name → its assignments. A dimension you omit is left alone; a dimension with
    /// an empty list is cleared.
    /// </param>
    public sealed record SetProjectProfileRequest(
        Dictionary<string, List<ProjectProfileAssignmentRequest>?>? Dimensions,
        ProjectProfileSettingsRequest? Settings);

    public sealed record SetSceneProjectRequest(int? ProjectId);
}
