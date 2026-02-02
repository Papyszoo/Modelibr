using Application.Abstractions.Services;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class AudioSelectionEndpoints
{
    public static void MapAudioSelectionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/audio-selection", GetSelection)
            .WithName("Get Audio Selection")
            .WithSummary("Gets the current audio selection state")
            .WithOpenApi();

        app.MapPost("/audio-selection", SetSelection)
            .WithName("Set Audio Selection")
            .WithSummary("Sets the audio selection state for trimmed playback")
            .WithOpenApi();

        app.MapDelete("/audio-selection", ClearSelection)
            .WithName("Clear Audio Selection")
            .WithSummary("Clears the current audio selection")
            .WithOpenApi();
    }

    private static IResult GetSelection(IAudioSelectionService selectionService)
    {
        var selection = selectionService.GetSelection();

        if (selection == null)
        {
            return Results.NotFound(new { message = "No active audio selection" });
        }

        return Results.Ok(new AudioSelectionResponse(
            selection.FileId,
            selection.FileName,
            selection.StartTime,
            selection.EndTime,
            selection.Duration));
    }

    private static IResult SetSelection(
        [FromBody] SetAudioSelectionRequest request,
        IAudioSelectionService selectionService)
    {
        if (string.IsNullOrWhiteSpace(request.FileName))
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "File name is required" });
        }

        if (request.EndTime <= request.StartTime)
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "End time must be greater than start time" });
        }

        if (request.StartTime < 0)
        {
            return Results.BadRequest(new { error = "InvalidInput", message = "Start time cannot be negative" });
        }

        try
        {
            selectionService.SetSelection(
                request.FileId,
                request.FileName,
                request.StartTime,
                request.EndTime);

            return Results.Ok(new AudioSelectionResponse(
                request.FileId,
                request.FileName,
                request.StartTime,
                request.EndTime,
                request.EndTime - request.StartTime));
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(new { error = "InvalidInput", message = ex.Message });
        }
    }

    private static IResult ClearSelection(IAudioSelectionService selectionService)
    {
        selectionService.ClearSelection();
        return Results.NoContent();
    }
}

public record SetAudioSelectionRequest(
    int FileId,
    string FileName,
    double StartTime,
    double EndTime);

public record AudioSelectionResponse(
    int FileId,
    string FileName,
    double StartTime,
    double EndTime,
    double Duration);
