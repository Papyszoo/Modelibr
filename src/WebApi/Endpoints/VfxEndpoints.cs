using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Vfx;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;
using WebApi.Files;
using WebApi.Infrastructure;

namespace WebApi.Endpoints;

public static class VfxEndpoints
{
    public static void MapVfxEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/vfx", GetVfxList)
            .WithName("Get Vfx List")
            .WithSummary("Gets every visual effect as a browsable summary")
            .WithOpenApi();

        app.MapGet("/vfx/{id}", GetVfxById)
            .WithName("Get Vfx By ID")
            .WithSummary("Gets one visual effect, its definition parsed as JSON")
            .WithOpenApi();

        app.MapGet("/vfx/{id}/export/godot", ExportVfxGodot)
            .WithName("Export Vfx To Godot")
            .WithSummary("Downloads a visual effect as a Godot 4 scene with its referenced files, zipped")
            .WithOpenApi();

        app.MapGet("/vfx/{id}/thumbnail/file", ServeVfxThumbnail)
            .WithName("Serve Vfx Thumbnail")
            .WithSummary("Serves the animated WebP thumbnail the worker rendered for a visual effect")
            .WithTags("Thumbnails");

        app.MapPost("/vfx/{id}/thumbnail/upload", UploadVfxThumbnail)
            .WithName("Upload Vfx Thumbnail")
            .WithSummary("Stores the animated WebP thumbnail rendered by the worker")
            .WithTags("Thumbnails")
            .AddEndpointFilter<WorkerApiKeyFilter>()
            .DisableAntiforgery();

        app.MapPost("/vfx/{id}/thumbnail/regenerate", RegenerateVfxThumbnail)
            .WithName("Regenerate Vfx Thumbnail")
            .WithSummary("Re-queues the animated thumbnail of one visual effect")
            .WithTags("Thumbnails");

        app.MapPost("/vfx/thumbnails/regenerate", RegenerateAllVfxThumbnails)
            .WithName("Regenerate All Vfx Thumbnails")
            .WithSummary("Re-queues the animated thumbnail of every visual effect (effects only)")
            .WithTags("Thumbnails");

        app.MapPost("/vfx", CreateVfx)
            .WithName("Create Vfx")
            .WithSummary("Creates a visual effect; an invalid definition is rejected whole")
            .WithOpenApi();

        app.MapPut("/vfx/{id}", UpdateVfx)
            .WithName("Update Vfx")
            .WithSummary("Updates a visual effect; omitted fields are left alone")
            .WithOpenApi();

        app.MapDelete("/vfx/{id}", DeleteVfx)
            .WithName("Delete Vfx")
            .WithSummary("Deletes a visual effect permanently")
            .WithOpenApi();
    }

    private static async Task<IResult> GetVfxList(
        IQueryHandler<GetVfxListQuery, IReadOnlyList<VfxSummaryDto>> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetVfxListQuery(), cancellationToken);

        return result.IsFailure
            ? BadRequest(result.Error)
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> GetVfxById(
        int id,
        IQueryHandler<GetVfxQuery, VfxDetailDto> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetVfxQuery(id), cancellationToken);

        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static async Task<IResult> ServeVfxThumbnail(
        int id,
        IQueryHandler<GetVfxThumbnailQuery, string> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetVfxThumbnailQuery(id), cancellationToken);
        if (result.IsFailure || !System.IO.File.Exists(result.Value))
            return Results.NotFound();

        return Results.File(result.Value, "image/webp");
    }

    private static async Task<IResult> RegenerateVfxThumbnail(
        int id,
        ICommandHandler<RegenerateVfxThumbnailCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new RegenerateVfxThumbnailCommand(id), cancellationToken);

        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(new { Message = "Vfx thumbnail regeneration queued", VfxId = id });
    }

    private static async Task<IResult> RegenerateAllVfxThumbnails(
        ICommandHandler<RegenerateAllVfxThumbnailsCommand, RegenerateAllVfxThumbnailsResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new RegenerateAllVfxThumbnailsCommand(), cancellationToken);

        return result.IsFailure
            ? BadRequest(result.Error)
            : Results.Ok(new { enqueuedCount = result.Value.EnqueuedCount });
    }

    private static async Task<IResult> UploadVfxThumbnail(
        int id,
        IFormFile file,
        ICommandHandler<UploadVfxThumbnailCommand, UploadVfxThumbnailResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UploadVfxThumbnailCommand(id, new FormFileUpload(file)),
            cancellationToken);

        if (result.IsFailure)
            return result.Error.Code == "VfxNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : BadRequest(result.Error);

        return Results.Ok(new { Message = "Vfx thumbnail uploaded", VfxId = id, result.Value.ThumbnailPath, result.Value.SizeBytes });
    }

    private static async Task<IResult> ExportVfxGodot(
        int id,
        IQueryHandler<ExportVfxGodotQuery, VfxGodotExport> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new ExportVfxGodotQuery(id), cancellationToken);

        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.File(result.Value.Content, "application/zip", result.Value.FileName);
    }

    private static async Task<IResult> CreateVfx(
        [FromBody] CreateVfxRequest request,
        ICommandHandler<CreateVfxCommand, VfxWriteOutcome> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new CreateVfxCommand(request.Name, request.Description, request.Definition),
            cancellationToken);

        if (result.IsFailure)
            return BadRequest(result.Error);

        return result.Value.IsValid
            ? Results.Created($"/vfx/{result.Value.Vfx!.Id}", result.Value.Vfx)
            : InvalidDefinition(result.Value.Problems);
    }

    private static async Task<IResult> UpdateVfx(
        int id,
        [FromBody] UpdateVfxRequest request,
        ICommandHandler<UpdateVfxCommand, VfxWriteOutcome> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateVfxCommand(id, request.Name, request.Description, request.Definition),
            cancellationToken);

        if (result.IsFailure)
            return result.Error.Code == "VfxNotFound"
                ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
                : BadRequest(result.Error);

        return result.Value.IsValid
            ? Results.Ok(result.Value.Vfx)
            : InvalidDefinition(result.Value.Problems);
    }

    private static async Task<IResult> DeleteVfx(
        int id,
        ICommandHandler<DeleteVfxCommand, DeleteVfxResponse> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteVfxCommand(id), cancellationToken);

        return result.IsFailure
            ? Results.NotFound(new { error = result.Error.Code, message = result.Error.Message })
            : Results.Ok(result.Value);
    }

    private static IResult BadRequest(Error error) =>
        Results.BadRequest(new { error = error.Code, message = error.Message });

    private static IResult InvalidDefinition(IReadOnlyList<VfxProblem> problems)
    {
        var message = $"The vfx definition was rejected ({problems.Count} problem{(problems.Count == 1 ? "" : "s")}).";

        return Results.BadRequest(new { error = "InvalidVfxDefinition", message, problems });
    }
}

public sealed record CreateVfxRequest(
    string Name,
    string? Description = null,
    JsonElement? Definition = null);

public sealed record UpdateVfxRequest(
    string? Name = null,
    string? Description = null,
    JsonElement? Definition = null);
