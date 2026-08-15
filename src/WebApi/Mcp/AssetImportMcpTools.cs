using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.EnvironmentMaps;
using Application.Models;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using Domain.ValueObjects;
using ModelContextProtocol.Server;
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
        [Description("Absolute path to an audio file readable by the SERVER.")] string path,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("Optional name (defaults to the file name without its extension).")] string? name = null,
        [Description("Optional sound category id.")] int? categoryId = null,
        [Description("Optional pack id to file the sound under.")] int? packId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "import-sound", "Sound"),
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
        [Description("Absolute path to an image file readable by the SERVER.")] string path,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("Optional name (defaults to the file name without its extension).")] string? name = null,
        [Description("Static (default), SpriteSheet, Gif or Apng.")] string spriteType = "Static",
        [Description("Optional sprite category id.")] int? categoryId = null,
        [Description("Optional pack id to file the sprite under.")] int? packId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "import-sprite", "Sprite"),
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
        [Description("Absolute path to an HDRI/image file readable by the SERVER.")] string path,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("Optional name (defaults to the file name without its extension).")] string? name = null,
        [Description("Optional resolution label for this variant, e.g. '1k', '4k'.")] string? sizeLabel = null,
        [Description("Optional pack id to file the environment map under.")] int? packId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "import-environment-map", "EnvironmentMap"),
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
        [Description("Name for the texture set, e.g. the material name.")] string name,
        [Description("Every channel of the material. The first creates the set; the rest are added to it.")] TextureChannelImport[] channels,
        [Description("Unique key so a retried call does not re-import.")] string idempotencyKey,
        [Description("ModelSpecific (default) or Universal. Universal = a reusable tiling material; it also gets a generated thumbnail.")] string kind = "ModelSpecific",
        [Description("Optional texture-set category id (must match the chosen kind).")] int? categoryId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "import-texture-set", "TextureSet"),
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
                        // The set exists and holds the channels added so far. Report both,
                        // so the agent can add the rest rather than re-importing a duplicate.
                        return Failed(new
                        {
                            error = result.Error.Code,
                            message = result.Error.Message,
                            partial = true,
                            textureSetId = setId,
                            channelsAdded = added,
                            failedChannel = channel.Type.ToString(),
                            recovery = "The set was created. Add the remaining channels with add_texture_channel - do not call import_texture_set again.",
                        });
                    }

                    added.Add(new { textureType = channel.Type.ToString(), textureId = result.Value.TextureId });
                }

                return Applied(
                    new { status = "ok", textureSetId = setId, name = created.Value.Name, channels = added },
                    "TextureSet", setId, new { setId, channelCount = added.Count });
            },
            cancellationToken);
    }

    [McpServerTool(Name = "add_texture_channel")]
    [Description("Add one more channel file to an existing texture set. Use after import_texture_set reports a partial failure, or to complete a set later.")]
    public static Task<object> AddTextureChannel(
        ICommandHandler<AddTextureToSetWithFileCommand, AddTextureToTextureSetResponse> handler,
        IAgentAudit audit,
        [Description("Target texture set id.")] int textureSetId,
        [Description("Absolute path to the image file, readable by the SERVER.")] string path,
        [Description("Albedo, Normal, Roughness, Metallic, AO, Height, Emissive, Opacity, Specular, SplitChannel...")] string textureType,
        [Description("Unique key so a retried call does not re-add.")] string idempotencyKey,
        [Description("For channel-packed maps only: R, G, B, A or RGB.")] string? sourceChannel = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "add-texture-channel", "TextureSet", textureSetId),
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

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", textureSetId, textureId = result.Value.TextureId, textureType = result.Value.TextureType.ToString() },
                        "TextureSet", textureSetId, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "bind_texture_set")]
    [Description("Bind a texture set to a model so it renders with it: associates the set with every version of the model and (by default) makes it the model's default set. This is the one-call form of a two-step the UI does manually.")]
    public static Task<object> BindTextureSet(
        ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand> associateHandler,
        ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse> defaultHandler,
        IAgentAudit audit,
        [Description("Texture set id to bind.")] int textureSetId,
        [Description("Model id to bind it to.")] int modelId,
        [Description("Unique key so a retried call does not re-bind.")] string idempotencyKey,
        [Description("Also make it the model's default texture set (default true). Set false to associate without changing what renders.")] bool setAsDefault = true,
        [Description("Optional material name to bind against, for models with several materials.")] string? materialName = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            new AgentWrite(idempotencyKey, "bind-texture-set", "Model", modelId),
            async ct =>
            {
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
                        "Model", modelId, new { textureSetId, modelId });
                }

                var defaulted = await defaultHandler.Handle(
                    new SetDefaultTextureSetCommand(modelId, textureSetId), ct);

                return defaulted.IsFailure
                    ? Failed(defaulted.Error)
                    : Applied(
                        new { status = "ok", textureSetId, modelId, isDefault = true },
                        "Model", modelId, new { textureSetId, modelId, isDefault = true });
            },
            cancellationToken);
    }

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
