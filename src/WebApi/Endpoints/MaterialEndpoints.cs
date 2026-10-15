using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Materials;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class MaterialEndpoints
{
    public static void MapMaterialEndpoints(this IEndpointRouteBuilder app)
    {
        // The merged browse surface. Materials and global materials in one list,
        // because both attach to a model's material slot.
        app.MapGet("/materials/library", GetMaterialLibrary)
            .WithName("Get Material Library")
            .WithSummary("Gets materials and global materials as one browsable list")
            .WithOpenApi();

        app.MapGet("/materials", GetAllMaterials)
            .WithName("Get All Materials")
            .WithSummary("Gets all parameter materials")
            .WithOpenApi();

        app.MapGet("/materials/{id}", GetMaterialById)
            .WithName("Get Material By ID")
            .WithSummary("Gets a specific material by ID")
            .WithOpenApi();

        app.MapGet("/materials/{id}/export/godot", ExportMaterialGodot)
            .WithName("Export Material To Godot")
            .WithSummary("Downloads a material as a Godot 4 ShaderMaterial with its effects shader, zipped")
            .WithOpenApi();

        app.MapPost("/materials", CreateMaterial)
            .WithName("Create Material")
            .WithSummary("Creates a material from parameters - no files involved")
            .WithOpenApi();

        // PUT and PATCH are the same patch semantics: every omitted field is left alone.
        // PATCH is the honest verb for that, so both are mapped to the one handler.
        app.MapPut("/materials/{id}", UpdateMaterial)
            .WithName("Update Material")
            .WithSummary("Updates a material; omitted fields are left alone")
            .WithOpenApi();

        app.MapPatch("/materials/{id}", UpdateMaterial)
            .WithName("Patch Material")
            .WithSummary("Patches a material; omitted fields are left alone")
            .WithOpenApi();

        app.MapPut("/materials/{id}/tags", UpdateMaterialTags)
            .WithName("Update Material Tags")
            .WithSummary("Replaces a material's tags")
            .WithOpenApi();

        app.MapDelete("/materials/{id}", SoftDeleteMaterial)
            .WithName("Delete Material")
            .WithSummary("Recycles a material - it can be restored")
            .WithOpenApi();

        app.MapPost("/materials/{id}/restore", RestoreMaterial)
            .WithName("Restore Material")
            .WithSummary("Restores a recycled material")
            .WithOpenApi();
    }

    private static async Task<IResult> GetMaterialLibrary(
        [FromQuery(Name = "categoryIds")] int[]? categoryIds,
        string? searchName,
        bool? requiresUvs,
        int? page,
        int? pageSize,
        IQueryHandler<GetMaterialLibraryQuery, GetMaterialLibraryResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(
            new GetMaterialLibraryQuery(
                CategoryIds: categoryIds is { Length: > 0 } ? categoryIds : null,
                SearchName: string.IsNullOrWhiteSpace(searchName) ? null : searchName,
                RequiresUvs: requiresUvs,
                Page: page,
                PageSize: pageSize),
            cancellationToken);

        return result.IsFailure
            ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> GetAllMaterials(
        [FromQuery(Name = "categoryIds")] int[]? categoryIds,
        string? searchName,
        IQueryHandler<GetAllMaterialsQuery, GetAllMaterialsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(
            new GetAllMaterialsQuery(
                CategoryIds: categoryIds is { Length: > 0 } ? categoryIds : null,
                SearchName: string.IsNullOrWhiteSpace(searchName) ? null : searchName),
            cancellationToken);

        return result.IsFailure
            ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> GetMaterialById(
        int id,
        IQueryHandler<GetMaterialByIdQuery, MaterialDto> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetMaterialByIdQuery(id), cancellationToken);

        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> ExportMaterialGodot(
        int id,
        IQueryHandler<ExportMaterialGodotQuery, MaterialGodotExport> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new ExportMaterialGodotQuery(id), cancellationToken);

        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.File(result.Value.Content, "application/zip", result.Value.FileName);
    }

    private static async Task<IResult> CreateMaterial(
        [FromBody] CreateMaterialRequest request,
        ICommandHandler<CreateMaterialCommand, CreateMaterialResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new CreateMaterialCommand(
                request.Name,
                request.Parameters,
                request.Description,
                request.CategoryId,
                request.PreviewGeometryType,
                request.Tags,
                request.Effects),
            cancellationToken);

        return result.IsFailure
            ? Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Created($"/materials/{result.Value.Id}", result.Value);
    }

    private static async Task<IResult> UpdateMaterial(
        int id,
        [FromBody] UpdateMaterialRequest request,
        ICommandHandler<UpdateMaterialCommand, MaterialDto> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateMaterialCommand(
                id,
                request.Name,
                request.Description,
                request.Parameters,
                request.CategoryId,
                request.ClearCategory ?? false,
                request.PreviewGeometryType,
                request.Effects,
                request.ClearEffects ?? false),
            cancellationToken);

        if (result.IsFailure)
        {
            return result.Error.Code == "MaterialNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> UpdateMaterialTags(
        int id,
        [FromBody] UpdateMaterialTagsRequest request,
        ICommandHandler<UpdateMaterialTagsCommand, UpdateMaterialTagsResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateMaterialTagsCommand(id, request.Tags),
            cancellationToken);

        if (result.IsFailure)
        {
            return result.Error.Code == "MaterialNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> SoftDeleteMaterial(
        int id,
        ICommandHandler<SoftDeleteMaterialCommand, SoftDeleteMaterialResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new SoftDeleteMaterialCommand(id), cancellationToken);

        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> RestoreMaterial(
        int id,
        ICommandHandler<RestoreMaterialCommand, RestoreMaterialResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new RestoreMaterialCommand(id), cancellationToken);

        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }
}

public record CreateMaterialRequest(
    string Name,
    MaterialParametersRequest? Parameters = null,
    string? Description = null,
    int? CategoryId = null,
    string? PreviewGeometryType = null,
    IReadOnlyCollection<string>? Tags = null,
    JsonElement? Effects = null);

public record UpdateMaterialRequest(
    string? Name = null,
    string? Description = null,
    MaterialParametersRequest? Parameters = null,
    int? CategoryId = null,
    bool? ClearCategory = null,
    string? PreviewGeometryType = null,
    JsonElement? Effects = null,
    bool? ClearEffects = null);

public record UpdateMaterialTagsRequest(IReadOnlyCollection<string>? Tags);
