using Application.Abstractions.Messaging;
using Application.Projects;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;

namespace WebApi.Endpoints;

/// <summary>Project-scoped character production endpoints.</summary>
public static class ProjectCharacterEndpoints
{
    public static void MapProjectCharacterEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/projects/{projectId:int}/characters", GetCharacters);
        app.MapGet("/projects/{projectId:int}/characters/{characterId:int}", GetCharacter);
        app.MapPost("/projects/{projectId:int}/characters", CreateCharacter);
        app.MapPut("/projects/{projectId:int}/characters/{characterId:int}", UpdateCharacter);
        app.MapDelete("/projects/{projectId:int}/characters/{characterId:int}", DeleteCharacter);

        app.MapPost("/projects/{projectId:int}/characters/{characterId:int}/images", AddImage);
        app.MapPut("/projects/{projectId:int}/characters/{characterId:int}/images/{imageId:int}", UpdateImage);
        app.MapDelete("/projects/{projectId:int}/characters/{characterId:int}/images/{imageId:int}", RemoveImage);
        app.MapPost("/projects/{projectId:int}/characters/{characterId:int}/models", AddModel);
        app.MapPut("/projects/{projectId:int}/characters/{characterId:int}/models/{modelLinkId:int}", UpdateModel);
        app.MapDelete("/projects/{projectId:int}/characters/{characterId:int}/models/{modelLinkId:int}", RemoveModel);
        app.MapPost("/projects/{projectId:int}/characters/{characterId:int}/abilities", AddAbility);
        app.MapPut("/projects/{projectId:int}/characters/{characterId:int}/abilities/{abilityId:int}", UpdateAbility);
        app.MapDelete("/projects/{projectId:int}/characters/{characterId:int}/abilities/{abilityId:int}", RemoveAbility);
        app.MapPost("/projects/{projectId:int}/characters/{characterId:int}/variants", AddVariant);
        app.MapPut("/projects/{projectId:int}/characters/{characterId:int}/variants/{variantId:int}", UpdateVariant);
        app.MapDelete("/projects/{projectId:int}/characters/{characterId:int}/variants/{variantId:int}", RemoveVariant);
    }

    private static async Task<IResult> GetCharacters(
        int projectId,
        IQueryHandler<GetProjectCharactersQuery, IReadOnlyList<ProjectCharacterDto>> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new GetProjectCharactersQuery(projectId), cancellationToken));

    private static async Task<IResult> GetCharacter(
        int projectId,
        int characterId,
        IQueryHandler<GetProjectCharacterByIdQuery, ProjectCharacterDto> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new GetProjectCharacterByIdQuery(projectId, characterId), cancellationToken));

    private static async Task<IResult> CreateCharacter(
        int projectId,
        [FromBody] ProjectCharacterRequest request,
        ICommandHandler<CreateProjectCharacterCommand, ProjectCharacterDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new CreateProjectCharacterCommand(
            projectId, request.Name, request.Description, request.Tags), cancellationToken);
        return result.IsSuccess
            ? Results.Created($"/projects/{projectId}/characters/{result.Value.Id}", result.Value)
            : Respond(result.Error);
    }

    private static async Task<IResult> UpdateCharacter(
        int projectId,
        int characterId,
        [FromBody] ProjectCharacterRequest request,
        ICommandHandler<UpdateProjectCharacterCommand, ProjectCharacterDto> handler,
        CancellationToken cancellationToken)
        => Respond(await handler.Handle(new UpdateProjectCharacterCommand(
            projectId, characterId, request.Name, request.Description, request.Tags), cancellationToken));

    private static async Task<IResult> DeleteCharacter(
        int projectId,
        int characterId,
        ICommandHandler<DeleteProjectCharacterCommand> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new DeleteProjectCharacterCommand(projectId, characterId), cancellationToken);
        return result.IsSuccess ? Results.NoContent() : Respond(result.Error);
    }

    private static async Task<IResult> AddImage(
        int projectId,
        int characterId,
        [FromBody] ProjectCharacterImageRequest request,
        ICommandHandler<AddProjectCharacterImageCommand, ProjectCharacterImageDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new AddProjectCharacterImageCommand(
            projectId, characterId, request.FileId, request.Title, request.Caption, request.SortOrder), cancellationToken);
        return result.IsSuccess
            ? Results.Created($"/projects/{projectId}/characters/{characterId}/images/{result.Value.Id}", result.Value)
            : Respond(result.Error);
    }

    private static async Task<IResult> UpdateImage(
        int projectId,
        int characterId,
        int imageId,
        [FromBody] UpdateProjectCharacterImageRequest request,
        ICommandHandler<UpdateProjectCharacterImageCommand, ProjectCharacterImageDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new UpdateProjectCharacterImageCommand(
            projectId, characterId, imageId, request.Title, request.Caption, request.SortOrder), cancellationToken);
        return Respond(result);
    }

    private static async Task<IResult> RemoveImage(
        int projectId,
        int characterId,
        int imageId,
        ICommandHandler<RemoveProjectCharacterImageCommand> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new RemoveProjectCharacterImageCommand(projectId, characterId, imageId), cancellationToken);
        return result.IsSuccess ? Results.NoContent() : Respond(result.Error);
    }

    private static async Task<IResult> AddModel(
        int projectId,
        int characterId,
        [FromBody] ProjectCharacterModelRequest request,
        ICommandHandler<AddProjectCharacterModelCommand, ProjectCharacterModelDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new AddProjectCharacterModelCommand(
            projectId, characterId, request.ModelId, request.Label, request.SortOrder), cancellationToken);
        return result.IsSuccess
            ? Results.Created($"/projects/{projectId}/characters/{characterId}/models/{result.Value.Id}", result.Value)
            : Respond(result.Error);
    }

    private static async Task<IResult> UpdateModel(
        int projectId,
        int characterId,
        int modelLinkId,
        [FromBody] UpdateProjectCharacterModelRequest request,
        ICommandHandler<UpdateProjectCharacterModelCommand, ProjectCharacterModelDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new UpdateProjectCharacterModelCommand(
            projectId, characterId, modelLinkId, request.Label, request.SortOrder), cancellationToken);
        return Respond(result);
    }

    private static async Task<IResult> RemoveModel(
        int projectId,
        int characterId,
        int modelLinkId,
        ICommandHandler<RemoveProjectCharacterModelCommand> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new RemoveProjectCharacterModelCommand(projectId, characterId, modelLinkId), cancellationToken);
        return result.IsSuccess ? Results.NoContent() : Respond(result.Error);
    }

    private static async Task<IResult> AddAbility(
        int projectId,
        int characterId,
        [FromBody] CharacterAbilityRequest request,
        ICommandHandler<AddCharacterAbilityCommand, CharacterAbilityDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new AddCharacterAbilityCommand(
            projectId, characterId, request.Name, request.Description, request.SortOrder), cancellationToken);
        return result.IsSuccess
            ? Results.Created($"/projects/{projectId}/characters/{characterId}/abilities/{result.Value.Id}", result.Value)
            : Respond(result.Error);
    }

    private static async Task<IResult> UpdateAbility(
        int projectId,
        int characterId,
        int abilityId,
        [FromBody] UpdateCharacterAbilityRequest request,
        ICommandHandler<UpdateCharacterAbilityCommand, CharacterAbilityDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new UpdateCharacterAbilityCommand(
            projectId, characterId, abilityId, request.Name, request.Description, request.SortOrder), cancellationToken);
        return Respond(result);
    }

    private static async Task<IResult> RemoveAbility(
        int projectId,
        int characterId,
        int abilityId,
        ICommandHandler<RemoveCharacterAbilityCommand> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new RemoveCharacterAbilityCommand(projectId, characterId, abilityId), cancellationToken);
        return result.IsSuccess ? Results.NoContent() : Respond(result.Error);
    }

    private static async Task<IResult> AddVariant(
        int projectId,
        int characterId,
        [FromBody] CharacterVariantRequest request,
        ICommandHandler<AddCharacterVariantCommand, CharacterVariantDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new AddCharacterVariantCommand(
            projectId, characterId, request.Name, request.Description, request.ProjectLevelId, request.SortOrder), cancellationToken);
        return result.IsSuccess
            ? Results.Created($"/projects/{projectId}/characters/{characterId}/variants/{result.Value.Id}", result.Value)
            : Respond(result.Error);
    }

    private static async Task<IResult> UpdateVariant(
        int projectId,
        int characterId,
        int variantId,
        [FromBody] UpdateCharacterVariantRequest request,
        ICommandHandler<UpdateCharacterVariantCommand, CharacterVariantDto> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new UpdateCharacterVariantCommand(
            projectId,
            characterId,
            variantId,
            request.Name,
            request.Description,
            request.ProjectLevelId,
            request.SortOrder), cancellationToken);
        return Respond(result);
    }

    private static async Task<IResult> RemoveVariant(
        int projectId,
        int characterId,
        int variantId,
        ICommandHandler<RemoveCharacterVariantCommand> handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.Handle(new RemoveCharacterVariantCommand(projectId, characterId, variantId), cancellationToken);
        return result.IsSuccess ? Results.NoContent() : Respond(result.Error);
    }

    private static IResult Respond<T>(Result<T> result) =>
        result.IsSuccess ? Results.Ok(result.Value) : Respond(result.Error);

    private static IResult Respond(Result result) =>
        result.IsSuccess ? Results.NoContent() : Respond(result.Error);

    private static IResult Respond(Error error)
    {
        var body = new { error = error.Code, message = error.Message };
        return error.Code is "ProjectCharacterNotFound"
            or "ProjectCharacterImageNotFound"
            or "ProjectCharacterModelNotFound"
            or "CharacterAbilityNotFound"
            or "CharacterVariantNotFound"
            or "ProjectLevelNotFound"
            ? Results.NotFound(body)
            : Results.BadRequest(body);
    }
}

public sealed record ProjectCharacterRequest(
    string Name,
    string? Description,
    IReadOnlyList<string>? Tags = null);

public sealed record ProjectCharacterImageRequest(
    int FileId,
    string? Title,
    string? Caption,
    int? SortOrder = null);

public sealed record ProjectCharacterModelRequest(
    int ModelId,
    string? Label,
    int? SortOrder = null);

public sealed record CharacterAbilityRequest(
    string Name,
    string? Description,
    int? SortOrder = null);

public sealed record UpdateProjectCharacterImageRequest(
    string? Title,
    string? Caption,
    int? SortOrder = null);

public sealed record UpdateProjectCharacterModelRequest(
    string? Label,
    int? SortOrder = null);

public sealed record UpdateCharacterAbilityRequest(
    string Name,
    string? Description,
    int? SortOrder = null);

public sealed record UpdateCharacterVariantRequest(
    string Name,
    string? Description,
    int? ProjectLevelId,
    int? SortOrder = null);

public sealed record CharacterVariantRequest(
    string Name,
    string? Description,
    int? ProjectLevelId,
    int? SortOrder = null);
