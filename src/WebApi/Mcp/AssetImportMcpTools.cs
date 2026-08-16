using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.Agents;
using Application.EnvironmentMaps;
using Application.Models;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using Domain.ValueObjects;
using ModelContextProtocol.Server;
using WebApi.Infrastructure;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// MCP write tools for the asset families beyond Model: sounds, sprites, environment maps
/// and texture sets, plus binding a texture set to a model.
///
/// Why this exists: the first write phase shipped six tools and every one of them was
/// Model-only, so "an agent can do everything a user can do" was about one sixth true.
/// Validating against a real library, a 4,375-sound corpus had to bypass MCP entirely and
/// POST to <c>/sounds/with-file</c>, because no tool could carry a sound.
///
/// Same rules as <see cref="AssetWriteMcpTools"/>: registered only when
/// <c>MCP_WRITE_ENABLED=true</c>, thin pass-throughs over the command handlers the UI
/// uses, and every write guarded by an idempotency claim (<see cref="McpWriteGuard"/>).
///
/// Each tool takes a <b>server-readable</b> path, mirroring <c>import_model</c>'s
/// co-located branch. Remote callers use the HTTP data plane; <c>import_model</c> with no
/// path returns those instructions.
/// </summary>
[McpServerToolType]
public sealed class AssetImportMcpTools
{
    /// <summary>One channel of a texture set: the file, what it represents, and (for
    /// channel-packed maps) which colour channel carries it.</summary>
    public sealed record TextureChannelImport(
        [property: Description("Absolute path to the image file, readable by the SERVER.")] string Path,
        [property: Description("Albedo, Normal, Roughness, Metallic, AO, Height, Emissive, Opacity, Specular, SplitChannel...")] string TextureType,
        [property: Description("For channel-packed maps only: R, G, B, A or RGB. Omit for a normal single-purpose map.")] string? SourceChannel = null);

    [McpServerTool(Name = "import_sound")]
    [Description("Import a sound from a server-readable path. Duration and waveform peaks are derived by the worker afterwards - do not try to supply them.")]
    public static Task<object> ImportSound(
        ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Absolute path to an audio file readable by the SERVER.")] string path,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("Optional name (defaults to the file name without its extension).")] string? name = null,
        [Description("Optional sound category id.")] int? categoryId = null,
        [Description("Optional pack id to file the sound under.")] int? packId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "import-sound", "Sound", BatchId: batchId),
            async ct =>
            {
                var (failure, upload) = await ReadUploadAsync(path, ct);
                if (failure is not null) return failure;

                // Duration 0 on purpose: the waveform job measures it. Guessing here would
                // write a wrong number that nothing later corrects.
                var result = await handler.Handle(
                    new CreateSoundWithFileCommand(
                        upload!,
                        name ?? System.IO.Path.GetFileNameWithoutExtension(path),
                        Duration: 0,
                        Peaks: null,
                        categoryId,
                        BatchId: null,
                        packId,
                        ProjectId: null),
                    ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", soundId = result.Value.SoundId, name = result.Value.Name, fileId = result.Value.FileId },
                        "Sound", result.Value.SoundId, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "import_sprite")]
    [Description("Import a sprite from a server-readable path. spriteType: Static, SpriteSheet, Gif or Apng.")]
    public static Task<object> ImportSprite(
        ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Absolute path to an image file readable by the SERVER.")] string path,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("Optional name (defaults to the file name without its extension).")] string? name = null,
        [Description("Static (default), SpriteSheet, Gif or Apng.")] string spriteType = "Static",
        [Description("Optional sprite category id.")] int? categoryId = null,
        [Description("Optional pack id to file the sprite under.")] int? packId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "import-sprite", "Sprite", BatchId: batchId),
            async ct =>
            {
                if (!TryParseEnum<SpriteType>(spriteType, out var parsedType, out var typeError))
                {
                    return typeError!;
                }

                var (failure, upload) = await ReadUploadAsync(path, ct);
                if (failure is not null) return failure;

                var result = await handler.Handle(
                    new CreateSpriteWithFileCommand(
                        upload!,
                        name ?? System.IO.Path.GetFileNameWithoutExtension(path),
                        parsedType,
                        categoryId,
                        BatchId: null,
                        packId,
                        ProjectId: null),
                    ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", spriteId = result.Value.SpriteId, name = result.Value.Name, fileId = result.Value.FileId },
                        "Sprite", result.Value.SpriteId, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "import_environment_map")]
    [Description("Import an environment map (HDRI or equirectangular image) from a server-readable path.")]
    public static Task<object> ImportEnvironmentMap(
        ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Absolute path to an HDRI/image file readable by the SERVER.")] string path,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("Optional name (defaults to the file name without its extension).")] string? name = null,
        [Description("Optional resolution label for this variant, e.g. '1k', '4k'.")] string? sizeLabel = null,
        [Description("Optional pack id to file the environment map under.")] int? packId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "import-environment-map", "EnvironmentMap", BatchId: batchId),
            async ct =>
            {
                var (failure, upload) = await ReadUploadAsync(path, ct);
                if (failure is not null) return failure;

                // Cube faces are a six-file upload with its own contract; this tool covers
                // the single-file (equirectangular/HDRI) case, which is what asset sites ship.
                var result = await handler.Handle(
                    new CreateEnvironmentMapWithFileCommand(
                        upload!,
                        CubeFaces: null,
                        name ?? System.IO.Path.GetFileNameWithoutExtension(path),
                        sizeLabel,
                        BatchId: null,
                        packId,
                        ProjectId: null),
                    ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new
                        {
                            status = "ok",
                            environmentMapId = result.Value.EnvironmentMapId,
                            name = result.Value.Name,
                            variantId = result.Value.VariantId,
                            projectionType = result.Value.ProjectionType,
                        },
                        "EnvironmentMap", result.Value.EnvironmentMapId, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "import_texture_set")]
    [Description("Import a whole material as one texture set: pass every channel file at once (albedo, normal, roughness...). kind: ModelSpecific (a model's baked maps) or Universal (a reusable tiling material).")]
    public static Task<object> ImportTextureSet(
        ICommandHandler<CreateTextureSetWithFileCommand, CreateTextureSetWithFileResponse> createHandler,
        ICommandHandler<AddTextureToSetWithFileCommand, AddTextureToTextureSetResponse> addHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Name for the texture set, e.g. the material name.")] string name,
        [Description("Every channel of the material. The first creates the set; the rest are added to it.")] TextureChannelImport[] channels,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("ModelSpecific (default) or Universal. Universal = a reusable tiling material; it also gets a generated thumbnail.")] string kind = "ModelSpecific",
        [Description("Optional texture-set category id (must match the chosen kind).")] int? categoryId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "import-texture-set", "TextureSet", BatchId: batchId),
            async ct =>
            {
                if (channels is null || channels.Length == 0)
                {
                    return Failed(new
                    {
                        error = "NoChannels",
                        message = "A texture set needs at least one channel.",
                        example = new { name = "RustedMetal", channels = new[] { new { path = "/assets/rusted_albedo.png", textureType = "Albedo" } } },
                    });
                }

                if (!TryParseEnum<TextureSetKind>(kind, out var parsedKind, out var kindError))
                {
                    return kindError!;
                }

                // Parse and read EVERY channel before writing anything. A material whose
                // fourth file has a typo should fail as a whole, not leave a half-built set
                // behind under a claimed idempotency key.
                var prepared = new List<(TextureType Type, TextureChannel? Channel, Application.Files.InMemoryFileUpload Upload)>();
                foreach (var channel in channels)
                {
                    if (!TryParseEnum<TextureType>(channel.TextureType, out var parsedType, out var typeError))
                    {
                        return typeError!;
                    }

                    TextureChannel? parsedChannel = null;
                    if (!string.IsNullOrWhiteSpace(channel.SourceChannel))
                    {
                        if (!TryParseEnum<TextureChannel>(channel.SourceChannel!, out var sourceChannel, out var channelError))
                        {
                            return channelError!;
                        }
                        parsedChannel = sourceChannel;
                    }

                    var (failure, upload) = await ReadUploadAsync(channel.Path, ct);
                    if (failure is not null) return failure;

                    prepared.Add((parsedType, parsedChannel, upload!));
                }

                var first = prepared[0];
                var created = await createHandler.Handle(
                    new CreateTextureSetWithFileCommand(
                        first.Upload,
                        name,
                        first.Type,
                        BatchId: null,
                        parsedKind,
                        categoryId),
                    ct);

                if (created.IsFailure)
                {
                    return Failed(created.Error);
                }

                var setId = created.Value.TextureSetId;
                var added = new List<object> { new { textureType = first.Type.ToString(), fileId = created.Value.FileId } };

                foreach (var channel in prepared.Skip(1))
                {
                    var result = await addHandler.Handle(
                        new AddTextureToSetWithFileCommand(setId, channel.Upload, channel.Type, channel.Channel),
                        ct);

                    if (result.IsFailure)
                    {
                        // Applied, not Failed, even though a channel did not land: the set and
                        // the channels before it are already committed. Abandoning the claim
                        // here released the key while that durable state stayed behind, so the
                        // partial set was unauditable, unreversible, and a retry of the same
                        // key built a second one. Completing the claim against the set that
                        // exists is what makes the recovery advice below true.
                        return Applied(
                            new
                            {
                                status = "partial",
                                error = result.Error.Code,
                                message = result.Error.Message,
                                partial = true,
                                textureSetId = setId,
                                channelsAdded = added,
                                failedChannel = channel.Type.ToString(),
                                recovery = "The set was created and is recorded under this idempotencyKey. Add the remaining channels with add_texture_channel - calling import_texture_set again with this key replays this result rather than importing a second set.",
                            },
                            AgentAssetFamilies.TextureSet,
                            setId,
                            new { setId, channelCount = added.Count, partial = true, failedChannel = channel.Type.ToString() });
                    }

                    added.Add(new { textureType = channel.Type.ToString(), textureId = result.Value.TextureId });
                }

                return Applied(
                    new { status = "ok", textureSetId = setId, name = created.Value.Name, channels = added },
                    AgentAssetFamilies.TextureSet, setId, new { setId, channelCount = added.Count });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "add_texture_channel")]
    [Description("Add one more channel file to an existing texture set. Use after import_texture_set reports a partial failure, or to complete a set later. " +
                 "A channel of the same type already in the set is REPLACED (except SplitChannel, which may repeat) - the displaced one is recorded so the write stays reversible.")]
    public static Task<object> AddTextureChannel(
        ICommandHandler<AddTextureToSetWithFileCommand, AddTextureToTextureSetResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Target texture set id.")] int textureSetId,
        [Description("Absolute path to the image file, readable by the SERVER.")] string path,
        [Description("Albedo, Normal, Roughness, Metallic, AO, Height, Emissive, Opacity, Specular, SplitChannel...")] string textureType,
        [Description("Unique key so a retried call does not re-add.")] string idempotencyKey,
        [Description("For channel-packed maps only: R, G, B, A or RGB.")] string? sourceChannel = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "add-texture-channel", AgentAssetFamilies.TextureSet, textureSetId, BatchId: batchId),
            async ct =>
            {
                if (!TryParseEnum<TextureType>(textureType, out var parsedType, out var typeError))
                {
                    return typeError!;
                }

                TextureChannel? parsedChannel = null;
                if (!string.IsNullOrWhiteSpace(sourceChannel))
                {
                    if (!TryParseEnum<TextureChannel>(sourceChannel!, out var channel, out var channelError))
                    {
                        return channelError!;
                    }
                    parsedChannel = channel;
                }

                var (failure, upload) = await ReadUploadAsync(path, ct);
                if (failure is not null) return failure;

                var result = await handler.Handle(
                    new AddTextureToSetWithFileCommand(textureSetId, upload!, parsedType, parsedChannel),
                    ct);

                // The displaced channel comes back from the command itself, so the co-located
                // and the HTTP paths record the same undo state rather than each capturing it
                // (or forgetting to) on their own.
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new
                        {
                            status = "ok",
                            textureSetId,
                            textureId = result.Value.TextureId,
                            textureType = result.Value.TextureType.ToString(),
                            replacedTextureId = result.Value.ReplacedTexture?.TextureId,
                        },
                        AgentAssetFamilies.TextureSet,
                        textureSetId,
                        new { textureId = result.Value.TextureId },
                        new { textureSetId, replacedTexture = result.Value.ReplacedTexture });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "bind_texture_set")]
    [Description("Bind a texture set to a model so it renders with it: associates the set with every version of the model and (by default) makes it the model's default set. This is the one-call form of a two-step the UI does manually.")]
    public static Task<object> BindTextureSet(
        ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand> associateHandler,
        ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse> defaultHandler,
        IQueryHandler<GetModelTextureBindingsQuery, ModelTextureBindingSnapshot> bindingsHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Texture set id to bind.")] int textureSetId,
        [Description("Model id to bind it to.")] int modelId,
        [Description("Unique key so a retried call does not re-bind.")] string idempotencyKey,
        [Description("Also make it the model's default texture set (default true). Set false to associate without changing what renders.")] bool setAsDefault = true,
        [Description("Optional material name to bind against, for models with several materials.")] string? materialName = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "bind-texture-set", AgentAssetFamilies.Model, modelId, BatchId: batchId),
            async ct =>
            {
                // What renders now, captured before it is replaced. Binding the wrong
                // material to forty models is the mistake this whole tool makes easy, so what
                // it displaces is the one thing undo cannot reconstruct later.
                //
                // The snapshot covers EVERY version, not just the active one: associating
                // maps the set into all of them, displaces whatever named-material mapping was
                // there, and fills in each version's default texture set wherever it was still
                // null. Recording only the active version's previous default described one
                // version's worth of a change that touched all of them, so undo reported
                // success while leaving the rest bound to the set the agent chose.
                var before = await bindingsHandler.Handle(
                    new GetModelTextureBindingsQuery(modelId, materialName), ct);
                if (before.IsFailure)
                {
                    return Failed(before.Error);
                }

                // Associating covers every version, so a model that gains a version later
                // does not silently lose its material.
                var associated = await associateHandler.Handle(
                    new AssociateTextureSetWithAllModelVersionsCommand(textureSetId, modelId, materialName), ct);

                if (associated.IsFailure)
                {
                    return Failed(associated.Error);
                }

                if (!setAsDefault)
                {
                    return Applied(
                        new { status = "ok", textureSetId, modelId, isDefault = false },
                        AgentAssetFamilies.Model, modelId, new { textureSetId, modelId }, new { binding = before.Value });
                }

                var defaulted = await defaultHandler.Handle(
                    new SetDefaultTextureSetCommand(modelId, textureSetId), ct);

                return defaulted.IsFailure
                    ? Failed(defaulted.Error)
                    : Applied(
                        new { status = "ok", textureSetId, modelId, isDefault = true },
                        AgentAssetFamilies.Model, modelId, new { textureSetId, modelId, isDefault = true },
                        new { binding = before.Value });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "request_upload_ticket")]
    [Description("For agents NOT running on the server: get a single-use ticket plus the exact endpoint and field names to upload an asset over HTTP. " +
                 "assetType: Model, Sound, Sprite, EnvironmentMap or TextureSet. The upload is audited under your idempotencyKey, so a retry cannot import twice. " +
                 "A material is several files: create the set with the first channel, then ask again with textureSetId set to add each remaining channel.")]
    public static async Task<object> RequestUploadTicket(
        IAgentUploadTickets tickets,
        McpCallerContext caller,
        [Description("Model, Sound, Sprite, EnvironmentMap or TextureSet.")] string assetType,
        [Description("Unique key the resulting upload is audited under.")] string idempotencyKey,
        [Description("Optional batch id, so a remote import can be reversed as one batch.")] string? batchId = null,
        [Description("TextureSet only: id of an EXISTING set to add one more channel to, instead of creating a new set.")] int? textureSetId = null,
        CancellationToken cancellationToken = default)
    {
        var denied = caller.Denied(McpScope.Write);
        if (denied is not null)
        {
            return denied;
        }

        if (!UploadTargets.TryGetValue(assetType, out var target))
        {
            return new
            {
                error = "UnknownAssetType",
                message = $"'{assetType}' has no HTTP upload endpoint.",
                validValues = UploadTargets.Keys.ToArray(),
            };
        }

        // Adding a channel to an existing set is a different operation against the same
        // family. Without this branch a remote agent could upload a material's first channel
        // and nothing else - every later channel needed a server-readable path it does not
        // have - so a four-map material was un-importable from anywhere but the server itself.
        if (textureSetId is { } setId)
        {
            if (!string.Equals(target.AssetType, AgentAssetFamilies.TextureSet, StringComparison.Ordinal))
            {
                return new
                {
                    error = "TextureSetIdNotApplicable",
                    message = $"textureSetId only applies to TextureSet uploads, not {target.AssetType}.",
                };
            }

            target = (
                AgentAssetFamilies.TextureSet,
                "add-texture-channel",
                $"POST /texture-sets/{setId}/textures/with-file",
                new
                {
                    file = "the channel's image (required)",
                    textureType = "Albedo, Normal, Roughness, Metallic, AO, Height, Emissive, Opacity, Specular, SplitChannel...",
                    sourceChannel = "channel-packed maps only: R, G, B, A or RGB",
                });
        }

        var ticket = await tickets.IssueAsync(
            idempotencyKey, target.Operation, target.AssetType, caller.Actor, batchId, cancellationToken);

        return new
        {
            status = "upload-required",
            ticket = new
            {
                header = AgentUploadTicketFilter.TicketHeader,
                value = ticket.Secret,
                expiresAt = ticket.ExpiresAt,
                note = "Single use. Send it as a header on the upload below; the upload is then audited and de-duplicated under this call's idempotencyKey.",
            },
            upload = new
            {
                endpoint = target.Endpoint,
                contentType = "multipart/form-data",
                fields = target.Fields,
            },
            afterwards = textureSetId is null
                ? "Curate the result with set_tags / set_category / add_to_pack, or bind a material with bind_texture_set."
                : "Ask for another ticket with the same textureSetId (and a fresh idempotencyKey) for each remaining channel.",
        };
    }

    /// <summary>
    /// Where each family's bytes go, and what the endpoint calls its parts. Returned to the
    /// agent verbatim: the failure this prevents is an agent guessing a field name, getting
    /// a 400, and burning a turn per guess.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, (string AssetType, string Operation, string Endpoint, object Fields)> UploadTargets =
        new Dictionary<string, (string, string, string, object)>(StringComparer.OrdinalIgnoreCase)
        {
            [AgentAssetFamilies.Model] = (AgentAssetFamilies.Model, "import-model", "POST /models",
                new { file = "the model file (required)" }),
            [AgentAssetFamilies.Sound] = (AgentAssetFamilies.Sound, "import-sound", "POST /sounds/with-file",
                new { file = "the audio file (required)", name = "optional; defaults to the file name", categoryId = "optional", packId = "optional" }),
            [AgentAssetFamilies.Sprite] = (AgentAssetFamilies.Sprite, "import-sprite", "POST /sprites/with-file",
                new { file = "the image file (required)", name = "optional", spriteType = "Static, SpriteSheet, Gif or Apng", categoryId = "optional", packId = "optional" }),
            [AgentAssetFamilies.EnvironmentMap] = (AgentAssetFamilies.EnvironmentMap, "import-environment-map", "POST /environment-maps/with-file",
                new { file = "the HDRI / equirectangular image (required)", name = "optional", sizeLabel = "optional, e.g. '4k'", packId = "optional" }),
            [AgentAssetFamilies.TextureSet] = (AgentAssetFamilies.TextureSet, "import-texture-set", "POST /texture-sets/with-file",
                new { file = "the first channel's image (required)", name = "the material name (required)", textureType = "Albedo, Normal, Roughness...", kind = "ModelSpecific or Universal" }),
        };

    /// <summary>
    /// Parses an enum name case-insensitively and, on failure, returns an outcome that
    /// <b>lists the valid values</b>. An agent that guesses "Metalness" gets the vocabulary
    /// back instead of a bare parse error, which is the difference between recovering in
    /// the same turn and burning three.
    /// </summary>
    private static bool TryParseEnum<TEnum>(string value, out TEnum parsed, out ToolOutcome? error)
        where TEnum : struct, Enum
    {
        if (Enum.TryParse(value, ignoreCase: true, out parsed) && Enum.IsDefined(parsed))
        {
            error = null;
            return true;
        }

        error = Failed(new
        {
            error = $"Invalid{typeof(TEnum).Name}",
            message = $"'{value}' is not a valid {typeof(TEnum).Name}.",
            validValues = Enum.GetNames<TEnum>(),
        });
        return false;
    }
}
