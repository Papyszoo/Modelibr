using Application.Abstractions.Messaging;
using Application.ModelCategories;
using Application.Models;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class ModelCategoryEndpoints
{
    public static void MapModelCategoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/model-categories", GetAllCategories)
            .WithName("Get All Model Categories")
            .WithOpenApi();

        app.MapPost("/model-categories", CreateCategory)
            .WithName("Create Model Category")
            .WithOpenApi();

        app.MapPut("/model-categories/{id}", UpdateCategory)
            .WithName("Update Model Category")
            .WithOpenApi();

        app.MapDelete("/model-categories/{id}", DeleteCategory)
            .WithName("Delete Model Category")
            .WithOpenApi();
    }

    private static async Task<IResult> GetAllCategories(
        IQueryHandler<GetAllModelCategoriesQuery, GetAllModelCategoriesResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllModelCategoriesQuery(), cancellationToken);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> CreateCategory(
        [FromBody] UpsertModelCategoryRequest request,
        ICommandHandler<CreateModelCategoryCommand, ModelCategorySummaryDto> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new CreateModelCategoryCommand(request.Name, request.Description, request.ParentId),
            cancellationToken);

        return result.IsSuccess
            ? Results.Created($"/model-categories/{result.Value.Id}", result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> UpdateCategory(
        int id,
        [FromBody] UpsertModelCategoryRequest request,
        ICommandHandler<UpdateModelCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateModelCategoryCommand(id, request.Name, request.Description, request.ParentId),
            cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> DeleteCategory(
        int id,
        ICommandHandler<DeleteModelCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteModelCategoryCommand(id), cancellationToken);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }
}

public record UpsertModelCategoryRequest(string Name, string? Description, int? ParentId);