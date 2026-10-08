using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Files;
using Application.Projects;
using Application.Scenes;
using Domain.Projects;
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

    [McpServerTool(Name = "add_project_comment")]
    [Description("Comment on a project, or on one thing in it: a level, reference image, character, model, texture set, sprite, sound, environment map or VFX (set at most one target id). A new comment is open. Set pinned=true to record it as a project decision. Idempotent per idempotencyKey.")]
    public static Task<object> AddProjectComment(
        ICommandHandler<CreateProjectCommentCommand, ProjectCommentDto> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Comment title.")] string title,
        [Description("Comment body.")] string body,
        [Description("Unique key so a retried call does not create a second comment.")] string idempotencyKey,
        [Description("Record this comment as a project decision (default false).")] bool pinned = false,
        [Description("Optional level this comment is about.")] int? levelId = null,
        [Description("Optional reference image this comment is about.")] int? referenceImageId = null,
        [Description("Optional character this comment is about.")] int? characterId = null,
        [Description("Optional model this comment is about.")] int? modelId = null,
        [Description("Optional texture set this comment is about.")] int? textureSetId = null,
        [Description("Optional sprite this comment is about.")] int? spriteId = null,
        [Description("Optional sound this comment is about.")] int? soundId = null,
        [Description("Optional environment map this comment is about.")] int? environmentMapId = null,
        [Description("Optional VFX this comment is about.")] int? vfxId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        var target = new ProjectCommentTarget(
            levelId, referenceImageId, characterId, modelId, textureSetId,
            spriteId, soundId, environmentMapId, vfxId);

        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "add-project-comment", "ProjectComment", BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new CreateProjectCommentCommand(projectId, target, title, body, pinned), ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(new { status = "ok", comment = result.Value }, "ProjectComment", result.Value.Id, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "update_project_comment")]
    [Description("Update a project comment: its title, body, pinned flag, or status. status=resolved closes it, optionally with a short resolution saying what changed; status=open reopens it and clears the resolution. An omitted field keeps its current value. Idempotent per idempotencyKey.")]
    public static Task<object> UpdateProjectComment(
        IQueryHandler<GetProjectCommentByIdQuery, ProjectCommentDto> query,
        ICommandHandler<UpdateProjectCommentCommand, ProjectCommentDto> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Comment id.")] int commentId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("New title; omit to keep the current one.")] string? title = null,
        [Description("New body; omit to keep the current one.")] string? body = null,
        [Description("New pinned (decision) flag; omit to keep the current one.")] bool? pinned = null,
        [Description("open or resolved; omit to keep the current status.")] string? status = null,
        [Description("What changed, recorded with a resolved comment. Omit to keep the current one.")] string? resolution = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "update-project-comment", "ProjectComment", commentId, BatchId: batchId),
            async ct =>
            {
                // The update command replaces the whole comment, so the fields the caller
                // left out are read back from the comment itself rather than reset to defaults.
                var current = await query.Handle(new GetProjectCommentByIdQuery(projectId, commentId), ct);
                if (current.IsFailure)
                {
                    return Failed(current.Error);
                }

                var existing = current.Value;
                var nextStatus = status ?? existing.Status;
                // A resolution belongs to one resolution: changing the status without
                // naming a new one drops the old text rather than carrying it across.
                var nextResolution = resolution
                    ?? (string.Equals(nextStatus, existing.Status, StringComparison.OrdinalIgnoreCase)
                        ? existing.Resolution
                        : null);

                var result = await handler.Handle(new UpdateProjectCommentCommand(
                    projectId,
                    commentId,
                    existing.ToTarget(),
                    title ?? existing.Title,
                    body ?? existing.Body,
                    pinned ?? existing.IsPinned,
                    nextStatus,
                    nextResolution), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", comment = result.Value },
                    "ProjectComment",
                    commentId,
                    result.Value,
                    new
                    {
                        title = existing.Title,
                        body = existing.Body,
                        isPinned = existing.IsPinned,
                        status = existing.Status,
                        resolution = existing.Resolution,
                        target = existing.ToTarget(),
                    });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "add_to_project")]
    [Description("Add a library asset to a project's assets. assetType: model, textureSet, sprite, sound, environmentMap or vfx. Adding an asset that is already in the project changes nothing. Undo with reverse_operation. Idempotent per idempotencyKey.")]
    public static Task<object> AddToProject(
        ICommandHandler<AddAssetToProjectCommand, AddAssetToProjectResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("model, textureSet, sprite, sound, environmentMap or vfx.")] string assetType,
        [Description("Id of the asset to add.")] int assetId,
        [Description("Unique key so a retried call does not re-add.")] string idempotencyKey,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "add-to-project", assetType, assetId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(new AddAssetToProjectCommand(projectId, assetType, assetId), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                var added = result.Value;
                return Applied(
                    new { status = "ok", projectId, assetType = added.AssetType, assetId, alreadyInProject = added.WasMember },
                    added.AssetType,
                    assetId,
                    new { projectId, assetType = added.AssetType, assetId },
                    // Whether it was already a member decides what undo may do: an add that
                    // changed nothing must not be undone by removing a membership it never made.
                    new { projectId, wasMember = added.WasMember });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "link_character_model")]
    [Description("Link a library model to a project character, with an optional label such as the variant it shows. The model is also added to the project's models if it is not there yet. Idempotent per idempotencyKey.")]
    public static Task<object> LinkCharacterModel(
        ICommandHandler<AddProjectCharacterModelCommand, ProjectCharacterModelDto> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Character id.")] int characterId,
        [Description("Model id to link.")] int modelId,
        [Description("Unique key so a retried call does not link twice.")] string idempotencyKey,
        [Description("Optional label for this model on the character.")] string? label = null,
        [Description("Optional batch id, grouping this with related writes.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "link-character-model", "ProjectCharacter", characterId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(
                    new AddProjectCharacterModelCommand(projectId, characterId, modelId, label, SortOrder: null), ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", characterId, model = result.Value },
                        "ProjectCharacter", characterId, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "add_project_reference")]
    [Description("Add an image to a project's Reference Board and set its title; when `comment` is given, also record a comment on it. Image source: `path` = a server-readable image file, or `fileId` = an already uploaded file. With neither, the response says how to upload one over HTTP. Idempotent per idempotencyKey.")]
    public static async Task<object> AddProjectReference(
        ICommandHandler<AddProjectConceptImageCommand> conceptHandler,
        IQueryHandler<GetProjectReferencesQuery, IReadOnlyList<ProjectReferenceDto>> referencesQuery,
        ICommandHandler<UpdateProjectReferenceCommand, ProjectReferenceDto> updateHandler,
        ICommandHandler<CreateProjectCommentCommand, ProjectCommentDto> commentHandler,
        ICommandHandler<UploadFileCommand, UploadFileCommandResponse> uploadHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Project id.")] int projectId,
        [Description("Title for the reference image.")] string title,
        [Description("Unique key so a retried call does not add a second reference.")] string idempotencyKey,
        [Description("Optional comment body; when given, a comment on this reference is created.")] string? comment = null,
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

                int? commentId = null;
                if (!string.IsNullOrWhiteSpace(comment))
                {
                    var created = await commentHandler.Handle(
                        new CreateProjectCommentCommand(
                            projectId, new ProjectCommentTarget(ReferenceImageId: referenceId), title, comment, IsPinned: false),
                        ct);
                    if (created.IsFailure)
                    {
                        return Failed(created.Error);
                    }

                    commentId = created.Value.Id;
                }

                return Applied(
                    new { status = "ok", referenceId, commentId, reference = titled.Value },
                    "ProjectReference",
                    referenceId,
                    new { referenceId, commentId });
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
