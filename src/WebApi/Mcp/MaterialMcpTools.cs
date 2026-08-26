using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Materials;
using ModelContextProtocol.Server;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// Materials over MCP.
///
/// The read half is registered unconditionally; <c>create_material</c> and
/// <c>update_material</c> are write tools and appear only when writes are enabled,
/// like every other write surface.
///
/// Why an agent needs this at all: in a library of untextured grey kit assets, a colour
/// and a roughness are the only thing that can dress a scene, and they cost nothing to
/// make - no files, no channels, no unwrap. Inventing one mid-scene has to be a single
/// call or the agent will not do it.
/// </summary>
[McpServerToolType]
public sealed class MaterialReadMcpTools
{
    [McpServerTool(Name = "list_materials")]
    [Description("Browse the material library: parameter materials (a colour and a roughness - no UVs needed) and tiling global materials " +
                 "(image channels - they need UVs) in one list, because both attach to a model's material slot. " +
                 "Every hit carries requiresUvs; pass requiresUvs=false to see only what is safe on an asset with bad or missing UVs. " +
                 "Bind a hit to a scene node with apply_material.")]
    public static async Task<object> ListMaterials(
        IQueryHandler<GetMaterialLibraryQuery, GetMaterialLibraryResponse> handler,
        McpCallerContext caller,
        [Description("Optional name substring, e.g. 'oak'.")] string? search = null,
        [Description("Optional filter: false = parameter materials only, true = tiling materials only.")] bool? requiresUvs = null,
        [Description("Optional category ids to filter by.")] int[]? categoryIds = null,
        [Description("Page number, 1-based.")] int? page = null,
        [Description("Page size.")] int? pageSize = null,
        CancellationToken cancellationToken = default)
    {
        var denied = caller.Denied(McpScope.Read);
        if (denied is not null)
        {
            return denied;
        }

        var result = await handler.Handle(
            new GetMaterialLibraryQuery(
                CategoryIds: categoryIds is { Length: > 0 } ? categoryIds : null,
                SearchName: search,
                RequiresUvs: requiresUvs,
                Page: page,
                PageSize: pageSize),
            cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new
            {
                entries = result.Value.Entries,
                totalCount = result.Value.TotalCount,
                page = result.Value.Page,
                pageSize = result.Value.PageSize,
                // Said out loud because the surface merges two tables and a caller that does
                // not know that will misread an id: ids are unique per kind, not across both.
                note = "Ids are per kind: pass a Material entry's id as apply_material's materialId, and a GlobalMaterial entry's id as its textureSetId.",
            };
    }

    [McpServerTool(Name = "get_material")]
    [Description("Read one parameter material in full - every factor, its render state, its category and tags.")]
    public static async Task<object> GetMaterial(
        IQueryHandler<GetMaterialByIdQuery, MaterialDto> handler,
        McpCallerContext caller,
        [Description("Material id.")] int materialId,
        CancellationToken cancellationToken = default)
    {
        var denied = caller.Denied(McpScope.Read);
        if (denied is not null)
        {
            return denied;
        }

        var result = await handler.Handle(new GetMaterialByIdQuery(materialId), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }
}

[McpServerToolType]
public sealed class MaterialWriteMcpTools
{
    [McpServerTool(Name = "create_material")]
    [Description("Create a material from parameters alone - no files, no channels, no UVs. " +
                 "baseColorHex plus roughness covers most of what a scene needs (\"matte black plastic\": #1A1A1A at roughness 0.6); " +
                 "metallic 1 for metals, alphaMode 'Blend' with baseColorAlpha for glass. " +
                 "Bind the result to a node with apply_material.")]
    public static Task<object> CreateMaterial(
        ICommandHandler<CreateMaterialCommand, CreateMaterialResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Material name, e.g. 'Matte Black Plastic'.")] string name,
        [Description("Unique key so a retried call does not create twice.")] string idempotencyKey,
        [Description("Base colour as sRGB #RRGGBB. Converted to linear on the way in.")] string? baseColorHex = null,
        [Description("0 = mirror-smooth, 1 = fully diffuse. Defaults to 1.")] float? roughness = null,
        [Description("0 = dielectric, 1 = metal. Defaults to 0.")] float? metallic = null,
        [Description("Opacity 0..1. Needs alphaMode 'Blend' to show.")] float? baseColorAlpha = null,
        [Description("Opaque (default), Mask or Blend.")] string? alphaMode = null,
        [Description("Render back faces too - curtains, foliage, single-sided walls.")] bool? doubleSided = null,
        [Description("Optional description.")] string? description = null,
        [Description("Optional category id, from the shared Universal vocabulary.")] int? categoryId = null,
        [Description("Optional tags.")] string[]? tags = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "create-material", "Material", BatchId: batchId),
            async ct =>
            {
                Domain.ValueObjects.AlphaMode? parsedAlphaMode = null;
                if (!string.IsNullOrWhiteSpace(alphaMode))
                {
                    if (!Enum.TryParse<Domain.ValueObjects.AlphaMode>(alphaMode, ignoreCase: true, out var parsed)
                        || !Enum.IsDefined(parsed))
                    {
                        return Failed(new
                        {
                            error = "UnknownAlphaMode",
                            message = $"'{alphaMode}' is not an alpha mode.",
                            valid = Enum.GetNames<Domain.ValueObjects.AlphaMode>(),
                        });
                    }

                    parsedAlphaMode = parsed;
                }

                var result = await handler.Handle(
                    new CreateMaterialCommand(
                        name,
                        new MaterialParametersRequest(
                            BaseColorHex: baseColorHex,
                            BaseColorA: baseColorAlpha,
                            Roughness: roughness,
                            Metallic: metallic,
                            AlphaMode: parsedAlphaMode,
                            DoubleSided: doubleSided),
                        description,
                        categoryId,
                        PreviewGeometryType: null,
                        Tags: tags),
                    ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", materialId = result.Value.Id, name = result.Value.Name },
                        "Material", result.Value.Id, result.Value);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "update_material")]
    [Description("Change a material's parameters. Omitted fields are left alone, so this is a patch, not a replacement.")]
    public static Task<object> UpdateMaterial(
        ICommandHandler<UpdateMaterialCommand, MaterialDto> handler,
        IQueryHandler<GetMaterialByIdQuery, MaterialDto> getHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Material id.")] int materialId,
        [Description("Unique key so a retried call does not apply twice.")] string idempotencyKey,
        [Description("New name.")] string? name = null,
        [Description("Base colour as sRGB #RRGGBB.")] string? baseColorHex = null,
        [Description("0 = mirror-smooth, 1 = fully diffuse.")] float? roughness = null,
        [Description("0 = dielectric, 1 = metal.")] float? metallic = null,
        [Description("Opacity 0..1.")] float? baseColorAlpha = null,
        [Description("Opaque, Mask or Blend.")] string? alphaMode = null,
        [Description("Render back faces too.")] bool? doubleSided = null,
        [Description("Optional batch id.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "update-material", "Material", materialId, BatchId: batchId),
            async ct =>
            {
                Domain.ValueObjects.AlphaMode? parsedAlphaMode = null;
                if (!string.IsNullOrWhiteSpace(alphaMode))
                {
                    if (!Enum.TryParse<Domain.ValueObjects.AlphaMode>(alphaMode, ignoreCase: true, out var parsed)
                        || !Enum.IsDefined(parsed))
                    {
                        return Failed(new
                        {
                            error = "UnknownAlphaMode",
                            message = $"'{alphaMode}' is not an alpha mode.",
                            valid = Enum.GetNames<Domain.ValueObjects.AlphaMode>(),
                        });
                    }

                    parsedAlphaMode = parsed;
                }

                // Read the whole material first: it is what reverse_operation restores, and
                // a patch that does not record what it replaced cannot be undone.
                var before = await getHandler.Handle(new GetMaterialByIdQuery(materialId), ct);
                if (before.IsFailure)
                {
                    return Failed(before.Error);
                }

                var result = await handler.Handle(
                    new UpdateMaterialCommand(
                        materialId,
                        name,
                        Parameters: new MaterialParametersRequest(
                            BaseColorHex: baseColorHex,
                            BaseColorA: baseColorAlpha,
                            Roughness: roughness,
                            Metallic: metallic,
                            AlphaMode: parsedAlphaMode,
                            DoubleSided: doubleSided)),
                    ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", material = result.Value },
                        "Material", materialId, result.Value, before.Value);
            },
            cancellationToken);
    }
}
