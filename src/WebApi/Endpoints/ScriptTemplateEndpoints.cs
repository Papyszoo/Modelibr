using Application.Abstractions.Messaging;
using Application.ScriptTemplates;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class ScriptTemplateEndpoints
{
    public static void MapScriptTemplateEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/script-templates", GetAllScriptTemplates)
            .WithName("Get All Script Templates")
            .WithSummary("Gets built-in and custom script templates")
            .WithOpenApi();

        app.MapPost("/script-templates", CreateScriptTemplate)
            .WithName("Create Script Template")
            .WithSummary("Creates a custom script template")
            .WithOpenApi();

        app.MapPut("/script-templates/{id}", UpdateScriptTemplate)
            .WithName("Update Script Template")
            .WithSummary("Updates a custom script template")
            .WithOpenApi();

        app.MapDelete("/script-templates/{id}", DeleteScriptTemplate)
            .WithName("Delete Script Template")
            .WithSummary("Deletes a custom script template")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllScriptTemplates(
        IQueryHandler<GetAllScriptTemplatesQuery, GetAllScriptTemplatesResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllScriptTemplatesQuery(), cancellationToken);
        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(new { templates = result.Value.Templates });
    }

    private static async Task<IResult> CreateScriptTemplate(
        [FromBody] CreateScriptTemplateRequest request,
        ICommandHandler<CreateScriptTemplateCommand, ScriptTemplateDto> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new CreateScriptTemplateCommand(request.Name, request.Language, request.Content, request.Description),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Created($"/script-templates/{result.Value.Id}", result.Value);
    }

    private static async Task<IResult> UpdateScriptTemplate(
        int id,
        [FromBody] UpdateScriptTemplateRequest request,
        ICommandHandler<UpdateScriptTemplateCommand, ScriptTemplateDto> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateScriptTemplateCommand(id, request.Name, request.Language, request.Content, request.Description),
            cancellationToken);

        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.Ok(result.Value);
    }

    private static async Task<IResult> DeleteScriptTemplate(
        int id,
        ICommandHandler<DeleteScriptTemplateCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteScriptTemplateCommand(id), cancellationToken);
        if (result.IsFailure)
        {
            return Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
        }

        return Results.NoContent();
    }
}

// Request DTOs
public record CreateScriptTemplateRequest(string Name, string Language, string? Content, string? Description = null);
public record UpdateScriptTemplateRequest(string Name, string Language, string? Content, string? Description = null);
