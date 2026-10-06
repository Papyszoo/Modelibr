using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Files;
using Application.Projects;
using Application.Scenes;
using ModelContextProtocol.Server;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// The one project-shaped write an agent needs: telling a scene which project it belongs to
/// (prompt 13-C/D1). Editing the profile itself is deliberately left to the user - it is a
/// statement about what is being made, not something an agent should infer and set.
/// </summary>
[McpServerToolType]
public sealed class ProjectWriteMcpTools
{
    [McpServerTool(Name = "set_scene_project")]
    [Description("Link a scene to a project so its brief applies, or pass projectId=null to unlink it. A scene write: it bumps the scene's revision and is undoable with reverse_operation.")]
    public static Task<object> SetSceneProject(
        ICommandHandler<SetSceneProjectCommand, SetSceneProjectResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Scene id.")] int sceneId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Project id to link to, or null to unlink.")] int? projectId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "set-scene-project", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(new SetSceneProjectCommand(sceneId, projectId), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", scene = result.Value },
                    "Scene",
                    sceneId,
                    result.Value,
                    // The link being replaced is the whole of what this write destroys.
                    new { projectId = result.Value.PreviousProjectId });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "add_project_note")]
    [Description("Record a production note on a project. Set pinned=true to mark it an idea the agent wants remembered. It may target at most one of a level, a reference image, or a character. Idempotent per idempotencyKey.")]
    public static Task<object> AddProjectNote(
        ICommandHandler<CreateProductionNoteCommand, ProductionNoteDto> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Note title.")] string title,
        [Description("Note body.")] string body,
        [Description("Unique key so a retried call does not create a second note.")] string idempotencyKey,
        [Description("Mark this note an idea (default false).")] bool pinned = false,
        [Description("Optional level this note is about.")] int? levelId = null,
        [Description("Optional reference image this note is about.")] int? referenceImageId = null,
        [Description("Optional character this note is about.")] int? characterId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "add-project-note", "ProductionNote", BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new CreateProductionNoteCommand(
                        projectId, levelId, referenceImageId, characterId, title, body, pinned),
                    ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(new { status = "ok", note = result.Value }, "ProductionNote", result.Value.Id, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "update_project_note")]
    [Description("Update a project note's title, body, or pinned flag. An omitted field keeps its current value. Idempotent per idempotencyKey.")]
    public static Task<object> UpdateProjectNote(
        IQueryHandler<GetProductionNoteByIdQuery, ProductionNoteDto> query,
        ICommandHandler<UpdateProductionNoteCommand, ProductionNoteDto> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Note id.")] int noteId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("New title; omit to keep the current one.")] string? title = null,
        [Description("New body; omit to keep the current one.")] string? body = null,
        [Description("New pinned flag; omit to keep the current one.")] bool? pinned = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "update-project-note", "ProductionNote", noteId, BatchId: batchId),
            async ct =>
            {
                // The update command replaces the whole note, so the fields the caller left
                // out are read back from the note itself rather than reset to defaults.
                var current = await query.Handle(new GetProductionNoteByIdQuery(projectId, noteId), ct);
                if (current.IsFailure)
                {
                    return Failed(current.Error);
                }

                var existing = current.Value;
                var result = await handler.Handle(new UpdateProductionNoteCommand(
                    projectId,
                    noteId,
                    existing.LevelId,
                    existing.ReferenceImageId,
                    existing.CharacterId,
                    title ?? existing.Title,
                    body ?? existing.Body,
                    pinned ?? existing.IsPinned), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", note = result.Value },
                    "ProductionNote",
                    noteId,
                    result.Value,
                    new
                    {
                        title = existing.Title,
                        body = existing.Body,
                        isPinned = existing.IsPinned,
                        levelId = existing.LevelId,
                        referenceImageId = existing.ReferenceImageId,
                        characterId = existing.CharacterId,
                    });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "add_project_reference")]
    [Description("Add an image to a project's Reference Board and set its title; when `note` is given, also record a production note linked to it. Image source: `path` = a server-readable image file, or `fileId` = an already uploaded file. With neither, the response says how to upload one over HTTP. Idempotent per idempotencyKey.")]
    public static async Task<object> AddProjectReference(
        ICommandHandler<AddProjectConceptImageCommand> conceptHandler,
        IQueryHandler<GetProjectReferencesQuery, IReadOnlyList<ProjectReferenceDto>> referencesQuery,
        ICommandHandler<UpdateProjectReferenceCommand, ProjectReferenceDto> updateHandler,
        ICommandHandler<CreateProductionNoteCommand, ProductionNoteDto> noteHandler,
        ICommandHandler<UploadFileCommand, UploadFileCommandResponse> uploadHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Title for the reference image.")] string title,
        [Description("Unique key so a retried call does not add a second reference.")] string idempotencyKey,
        [Description("Optional production-note body; when given, a note linked to this reference is created.")] string? note = null,
        [Description("Absolute path to an image file readable by the SERVER. Omit when passing fileId or asking for upload instructions.")] string? path = null,
        [Description("An already uploaded file id. Omit when passing path or asking for upload instructions.")] int? fileId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        // Remote case: neither source was given, so hand back the plain-file upload route.
        // A request_upload_ticket is not applicable here - that data plane carries the
        // asset-family imports, not a bare image.
        if (fileId is null && string.IsNullOrWhiteSpace(path))
        {
            var denied = caller.Denied(McpScope.Write);
            if (denied is not null)
            {
                return denied;
            }

            return new
            {
                status = "upload-required",
                message = "The MCP server can't read a client-side path, and no fileId was given. Upload the image to POST /files over HTTP, then call add_project_reference again with the returned fileId.",
                upload = new
                {
                    endpoint = "POST /files",
                    contentType = "multipart/form-data",
                    fields = new { file = "the image file (required)" },
                    example = "file=concept_hero.png",
                    response = new { fileId = 123, alreadyExists = false },
                },
                note = "No upload ticket is needed or issued for a plain image: the ticket data plane covers asset-family imports (Model, Sound, Sprite, EnvironmentMap, TextureSet).",
            };
        }

        return await Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "add-project-reference", "ProjectReference", BatchId: batchId),
            async ct =>
            {
                int resolvedFileId;
                if (fileId is { } provided)
                {
                    resolvedFileId = provided;
                }
                else
                {
                    var (failure, upload) = await ReadUploadAsync(path!, ct);
                    if (failure is not null)
                    {
                        return failure;
                    }

                    var uploaded = await uploadHandler.Handle(
                        new UploadFileCommand(upload!, UploadType: "file"), ct);
                    if (uploaded.IsFailure)
                    {
                        return Failed(uploaded.Error);
                    }

                    resolvedFileId = uploaded.Value.FileId;
                }

                // A file is content-addressed, so the same image may already sit on the
                // board. Reuse that reference rather than stacking a duplicate.
                var references = await referencesQuery.Handle(new GetProjectReferencesQuery(projectId), ct);
                if (references.IsFailure)
                {
                    return Failed(references.Error);
                }

                var existing = references.Value
                    .Where(reference => reference.FileId == resolvedFileId)
                    .OrderByDescending(reference => reference.Id)
                    .FirstOrDefault();

                int referenceId;
                if (existing is not null)
                {
                    referenceId = existing.Id;
                }
                else
                {
                    var added = await conceptHandler.Handle(
                        new AddProjectConceptImageCommand(projectId, resolvedFileId), ct);
                    if (added.IsFailure)
                    {
                        return Failed(added.Error);
                    }

                    var refreshed = await referencesQuery.Handle(new GetProjectReferencesQuery(projectId), ct);
                    if (refreshed.IsFailure)
                    {
                        return Failed(refreshed.Error);
                    }

                    referenceId = refreshed.Value
                        .Where(reference => reference.FileId == resolvedFileId)
                        .Select(reference => reference.Id)
                        .DefaultIfEmpty(0)
                        .Max();
                    if (referenceId == 0)
                    {
                        return Failed(new
                        {
                            error = "ProjectReferenceNotFound",
                            message = $"The reference for file {resolvedFileId} was not found after adding it.",
                        });
                    }
                }

                var titled = await updateHandler.Handle(
                    new UpdateProjectReferenceCommand(projectId, referenceId, title), ct);
                if (titled.IsFailure)
                {
                    return Failed(titled.Error);
                }

                int? noteId = null;
                if (!string.IsNullOrWhiteSpace(note))
                {
                    var created = await noteHandler.Handle(
                        new CreateProductionNoteCommand(
                            projectId, null, referenceId, null, title, note, IsPinned: false),
                        ct);
                    if (created.IsFailure)
                    {
                        return Failed(created.Error);
                    }

                    noteId = created.Value.Id;
                }

                return Applied(
                    new { status = "ok", referenceId, noteId, reference = titled.Value },
                    "ProjectReference",
                    referenceId,
                    new { referenceId, noteId });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "add_project_level")]
    [Description("Create a level in a project. status is the production status (defaults to Planned). Idempotent per idempotencyKey.")]
    public static Task<object> AddProjectLevel(
        ICommandHandler<CreateProjectLevelCommand, ProjectLevelDto> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Level name.")] string name,
        [Description("Unique key so a retried call does not create a second level.")] string idempotencyKey,
        [Description("Optional description.")] string? description = null,
        [Description("Optional production status (e.g. Planned, InProgress, Done).")] string? status = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "add-project-level", "ProjectLevel", BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new CreateProjectLevelCommand(projectId, name, description, status, SortOrder: null), ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(new { status = "ok", level = result.Value }, "ProjectLevel", result.Value.Id, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "update_project_level")]
    [Description("Update a project level's name, description, production status, or sort order. An omitted field keeps its current value. Idempotent per idempotencyKey.")]
    public static Task<object> UpdateProjectLevel(
        IQueryHandler<GetProjectLevelByIdQuery, ProjectLevelDto> query,
        ICommandHandler<UpdateProjectLevelCommand, ProjectLevelDto> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Level id.")] int levelId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("New name; omit to keep the current one.")] string? name = null,
        [Description("New description; omit to keep the current one.")] string? description = null,
        [Description("New production status; omit to keep the current one.")] string? status = null,
        [Description("New sort order; omit to keep the current one.")] int? sortOrder = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "update-project-level", "ProjectLevel", levelId, BatchId: batchId),
            async ct =>
            {
                // The update command takes the full level, so omitted fields come from the
                // level being edited rather than resetting to defaults.
                var current = await query.Handle(new GetProjectLevelByIdQuery(projectId, levelId), ct);
                if (current.IsFailure)
                {
                    return Failed(current.Error);
                }

                var existing = current.Value;
                var result = await handler.Handle(new UpdateProjectLevelCommand(
                    projectId,
                    levelId,
                    name ?? existing.Name,
                    description ?? existing.Description,
                    status ?? existing.ProductionStatus,
                    sortOrder ?? existing.SortOrder), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", level = result.Value },
                    "ProjectLevel",
                    levelId,
                    result.Value,
                    new
                    {
                        name = existing.Name,
                        description = existing.Description,
                        productionStatus = existing.ProductionStatus,
                        sortOrder = existing.SortOrder,
                    });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "add_project_character")]
    [Description("Create a character in a project. Idempotent per idempotencyKey.")]
    public static Task<object> AddProjectCharacter(
        ICommandHandler<CreateProjectCharacterCommand, ProjectCharacterDto> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Character name.")] string name,
        [Description("Unique key so a retried call does not create a second character.")] string idempotencyKey,
        [Description("Optional description.")] string? description = null,
        [Description("Optional tags.")] string[]? tags = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "add-project-character", "ProjectCharacter", BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new CreateProjectCharacterCommand(projectId, name, description, tags), ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", character = result.Value },
                        "ProjectCharacter", result.Value.Id, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "update_project_character")]
    [Description("Update a project character's name, description, or tags. An omitted field keeps its current value. Idempotent per idempotencyKey.")]
    public static Task<object> UpdateProjectCharacter(
        IQueryHandler<GetProjectCharacterByIdQuery, ProjectCharacterDto> query,
        ICommandHandler<UpdateProjectCharacterCommand, ProjectCharacterDto> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Character id.")] int characterId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("New name; omit to keep the current one.")] string? name = null,
        [Description("New description; omit to keep the current one.")] string? description = null,
        [Description("New tags; omit to keep the current ones.")] string[]? tags = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "update-project-character", "ProjectCharacter", characterId, BatchId: batchId),
            async ct =>
            {
                // The update command replaces name, description and tags together, so the
                // fields the caller left out are read back from the character itself.
                var current = await query.Handle(new GetProjectCharacterByIdQuery(projectId, characterId), ct);
                if (current.IsFailure)
                {
                    return Failed(current.Error);
                }

                var existing = current.Value;
                var result = await handler.Handle(new UpdateProjectCharacterCommand(
                    projectId,
                    characterId,
                    name ?? existing.Name,
                    description ?? existing.Description,
                    tags ?? existing.Tags), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", character = result.Value },
                    "ProjectCharacter",
                    characterId,
                    result.Value,
                    new { name = existing.Name, description = existing.Description, tags = existing.Tags });
            },
            cancellationToken);
    }
}
