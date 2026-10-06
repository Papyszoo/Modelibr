using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Projects;
using Application.Projects.Profile;
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

    [McpServerTool(Name = "list_project_notes")]
    [Description("A project's production notes. pinnedOnly=true returns just the ideas. Filter by levelId or referenceImageId to read one target's notes.")]
    public static async Task<object> ListProjectNotes(
        IQueryHandler<GetProductionNotesQuery, IReadOnlyList<ProductionNoteDto>> handler,
        [Description("Project id.")] int projectId,
        [Description("Optional level filter.")] int? levelId = null,
        [Description("Optional reference-image filter.")] int? referenceImageId = null,
        [Description("Only notes pinned as ideas (default false = all notes).")] bool pinnedOnly = false,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(
            new GetProductionNotesQuery(projectId, levelId, referenceImageId, pinnedOnly ? true : (bool?)null),
            cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { notes = result.Value };
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
