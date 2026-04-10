using Application.Abstractions.Messaging;
using Application.EnvironmentMaps;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class EnvironmentMapEndpoints
{
    public static void MapEnvironmentMapEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/environment-maps", GetAllEnvironmentMaps)
            .WithName("Get All Environment Maps")
            .WithSummary("Gets all environment maps")
            .WithOpenApi();

        app.MapGet("/environment-maps/{id}", GetEnvironmentMapById)
            .WithName("Get Environment Map By ID")
            .WithSummary("Gets an environment map by ID")
            .WithOpenApi();

        app.MapPost("/environment-maps", CreateEnvironmentMap)
            .WithName("Create Environment Map")
            .WithSummary("Creates an environment map from an existing file")
            .WithOpenApi();

        app.MapPost("/environment-maps/with-file", CreateEnvironmentMapWithFile)
            .WithName("Create Environment Map With File")
            .WithSummary("Creates an environment map and uploads its first variant")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapPut("/environment-maps/{id}", UpdateEnvironmentMap)
            .WithName("Update Environment Map")
            .WithSummary("Updates an environment map")
            .WithOpenApi();

        app.MapDelete("/environment-maps/{id}", DeleteEnvironmentMap)
            .WithName("Delete Environment Map")
            .WithSummary("Deletes an environment map")
            .WithOpenApi();

        app.MapDelete("/environment-maps/{id}/soft", SoftDeleteEnvironmentMap)
            .WithName("Soft Delete Environment Map")
            .WithSummary("Soft deletes an environment map")
            .WithOpenApi();

        app.MapPost("/environment-maps/{id}/variants", AddVariant)
            .WithName("Add Environment Map Variant")
            .WithSummary("Adds an existing file as an environment map variant")
            .WithOpenApi();

        app.MapPost("/environment-maps/{id}/variants/with-file", AddVariantWithFile)
            .WithName("Add Environment Map Variant With File")
            .WithSummary("Uploads and adds an environment map variant")
            .DisableAntiforgery()
            .WithOpenApi();

        app.MapDelete("/environment-maps/{id}/variants/{variantId}", RemoveVariant)
            .WithName("Remove Environment Map Variant")
            .WithSummary("Soft deletes an environment map variant")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllEnvironmentMaps(
        int? packId,
        int? projectId,
        int? page,
        int? pageSize,
        IQueryHandler<GetAllEnvironmentMapsQuery, GetAllEnvironmentMapsResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllEnvironmentMapsQuery(packId, projectId, page, pageSize), cancellationToken);

        if (result.IsFailure)
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });

        if (page.HasValue && pageSize.HasValue)
        {
            return Results.Ok(new
            {
                environmentMaps = result.Value.EnvironmentMaps,
                totalCount = result.Value.TotalCount,
                page = result.Value.Page,
                pageSize = result.Value.PageSize,
                totalPages = result.Value.TotalPages
            });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> GetEnvironmentMapById(
        int id,
        IQueryHandler<GetEnvironmentMapByIdQuery, GetEnvironmentMapByIdResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetEnvironmentMapByIdQuery(id), cancellationToken);
        return result.IsSuccess
            ? Results.Ok(result.Value.EnvironmentMap)
            : Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> CreateEnvironmentMap(
        [FromBody] CreateEnvironmentMapRequest request,
        ICommandHandler<CreateEnvironmentMapCommand, CreateEnvironmentMapResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new CreateEnvironmentMapCommand(request.Name, request.FileId, request.SizeLabel), cancellationToken);
        return result.IsSuccess
            ? Results.Created($"/environment-maps/{result.Value.Id}", result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> CreateEnvironmentMapWithFile(
        IFormFile file,
        string? name,
        string? sizeLabel,
        string? batchId,
        int? packId,
        int? projectId,
        ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
            return Results.BadRequest(new { error = "InvalidInput", message = "File is required." });

        var result = await commandHandler.Handle(
            new CreateEnvironmentMapWithFileCommand(
                new WebApi.Files.FormFileUpload(file),
                name ?? Path.GetFileNameWithoutExtension(file.FileName),
                sizeLabel ?? "1K",
                batchId,
                packId,
                projectId),
            cancellationToken);

        return result.IsSuccess
            ? Results.Created($"/environment-maps/{result.Value.EnvironmentMapId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> UpdateEnvironmentMap(
        int id,
        [FromBody] UpdateEnvironmentMapRequest request,
        ICommandHandler<UpdateEnvironmentMapCommand, UpdateEnvironmentMapResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new UpdateEnvironmentMapCommand(id, request.Name, request.PreviewVariantId), cancellationToken);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> DeleteEnvironmentMap(
        int id,
        ICommandHandler<DeleteEnvironmentMapCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteEnvironmentMapCommand(id), cancellationToken);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.NotFound(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> SoftDeleteEnvironmentMap(
        int id,
        ICommandHandler<SoftDeleteEnvironmentMapCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new SoftDeleteEnvironmentMapCommand(id), cancellationToken);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> AddVariant(
        int id,
        [FromBody] AddEnvironmentMapVariantRequest request,
        ICommandHandler<AddEnvironmentMapVariantCommand, AddEnvironmentMapVariantResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new AddEnvironmentMapVariantCommand(id, request.FileId, request.SizeLabel), cancellationToken);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> AddVariantWithFile(
        int id,
        IFormFile file,
        string? sizeLabel,
        ICommandHandler<AddEnvironmentMapVariantWithFileCommand, AddEnvironmentMapVariantResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
            return Results.BadRequest(new { error = "InvalidInput", message = "File is required." });

        var result = await commandHandler.Handle(
            new AddEnvironmentMapVariantWithFileCommand(id, new WebApi.Files.FormFileUpload(file), sizeLabel ?? "1K"),
            cancellationToken);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> RemoveVariant(
        int id,
        int variantId,
        ICommandHandler<RemoveEnvironmentMapVariantCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new RemoveEnvironmentMapVariantCommand(id, variantId), cancellationToken);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }
}

public record CreateEnvironmentMapRequest(string Name, int FileId, string SizeLabel);
public record UpdateEnvironmentMapRequest(string? Name, int? PreviewVariantId);
public record AddEnvironmentMapVariantRequest(int FileId, string SizeLabel);
