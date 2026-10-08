using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Projects;
using Application.Projects.Profile;
using Domain.Projects;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// Reading a project and its profile (prompt 13-D1). There were no project tools at all
/// before this, which is why "build a scene for this project" could not mean anything: the
/// agent could not see that a project had a style, a budget or an engine.
/// </summary>
[McpServerToolType]
public sealed class ProjectReadMcpTools
{
    [McpServerTool(Name = "list_projects")]
    [Description("Every project, one line each: name, style, platforms, the per-asset triangle budget, and how many scenes and models it has. Start here when a request names a project rather than a scene.")]
    public static async Task<object> ListProjects(
        IQueryHandler<ListProjectsQuery, IReadOnlyList<ProjectSummaryDto>> handler,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new ListProjectsQuery(), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { projects = result.Value };
    }

    [McpServerTool(Name = "get_project")]
    [Description("The project's full brief: description, notes, engines (with their roles), platforms, genres, styles, camera perspective, the fidelity budget, the world convention and what it converts to in each engine, the palette, concept-image URLs, the project's own environment maps, its scenes, and `guidance` - the constraints in plain sentences. Read this before choosing assets for a scene that belongs to a project.")]
    public static async Task<object> GetProject(
        IQueryHandler<GetProjectBriefQuery, ProjectBriefDto> handler,
        [Description("Project id.")] int projectId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetProjectBriefQuery(projectId), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }

    [McpServerTool(Name = "list_project_profile_options")]
    [Description("The profile vocabulary a project can be assigned from: engines, platforms, genres, styles and camera perspectives. Built-in options come first; a user may have added their own.")]
    public static async Task<object> ListProfileOptions(
        IQueryHandler<GetProjectProfileOptionsQuery, IReadOnlyList<ProjectProfileOptionDto>> handler,
        [Description("One dimension (engine, platform, genre, style, perspective). Omit for all of them.")] string? dimension = null,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetProjectProfileOptionsQuery(dimension), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { options = result.Value };
    }

    [McpServerTool(Name = "list_project_comments")]
    [Description("A project's comments, pinned ones (the project's decisions) first. Each is open or resolved, a resolved one may carry a resolution saying what changed, and each names at most one target: a level, reference image, character, model, texture set, sprite, sound, environment map or VFX. Filter by status, pinnedOnly, or any target id to read one thing's comments.")]
    public static async Task<object> ListProjectComments(
        IQueryHandler<GetProjectCommentsQuery, IReadOnlyList<ProjectCommentDto>> handler,
        [Description("Project id.")] int projectId,
        [Description("open or resolved; omit for both.")] string? status = null,
        [Description("Only pinned comments, the project's decisions (default false = all comments).")] bool pinnedOnly = false,
        [Description("Optional level filter.")] int? levelId = null,
        [Description("Optional reference-image filter.")] int? referenceImageId = null,
        [Description("Optional character filter.")] int? characterId = null,
        [Description("Optional model filter.")] int? modelId = null,
        [Description("Optional texture-set filter.")] int? textureSetId = null,
        [Description("Optional sprite filter.")] int? spriteId = null,
        [Description("Optional sound filter.")] int? soundId = null,
        [Description("Optional environment-map filter.")] int? environmentMapId = null,
        [Description("Optional VFX filter.")] int? vfxId = null,
        CancellationToken cancellationToken = default)
    {
        var target = new ProjectCommentTarget(
            levelId, referenceImageId, characterId, modelId, textureSetId,
            spriteId, soundId, environmentMapId, vfxId);
        var result = await handler.Handle(
            new GetProjectCommentsQuery(projectId, target, pinnedOnly ? true : null, status),
            cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { comments = result.Value };
    }

    [McpServerTool(Name = "list_project_levels")]
    [Description("A project's levels in production order, with their status, description and variant counts.")]
    public static async Task<object> ListProjectLevels(
        IQueryHandler<GetProjectLevelsQuery, IReadOnlyList<ProjectLevelDto>> handler,
        [Description("Project id.")] int projectId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetProjectLevelsQuery(projectId), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { levels = result.Value };
    }

    [McpServerTool(Name = "list_project_characters")]
    [Description("A project's characters, with their tags, images, linked models, abilities and variants.")]
    public static async Task<object> ListProjectCharacters(
        IQueryHandler<GetProjectCharactersQuery, IReadOnlyList<ProjectCharacterDto>> handler,
        [Description("Project id.")] int projectId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetProjectCharactersQuery(projectId), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { characters = result.Value };
    }
}
