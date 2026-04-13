using Application.Abstractions.Messaging;
using Application.EnvironmentMapCategories;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class EnvironmentMapCategoryEndpoints
{
    public static void MapEnvironmentMapCategoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/environment-map-categories", GetAllCategories).WithName("Get All Environment Map Categories").WithOpenApi();
        app.MapPost("/environment-map-categories", CreateCategory).WithName("Create Environment Map Category").WithOpenApi();
        app.MapPut("/environment-map-categories/{id}", UpdateCategory).WithName("Update Environment Map Category").WithOpenApi();
        app.MapDelete("/environment-map-categories/{id}", DeleteCategory).WithName("Delete Environment Map Category").WithOpenApi();
    }

    private static async Task<IResult> GetAllCategories(
        IQueryHandler<GetAllEnvironmentMapCategoriesQuery, GetAllEnvironmentMapCategoriesResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllEnvironmentMapCategoriesQuery(), cancellationToken);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> CreateCategory(
        [FromBody] UpsertEnvironmentMapCategoryRequest request,
        ICommandHandler<CreateEnvironmentMapCategoryCommand, EnvironmentMapCategorySummaryDto> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new CreateEnvironmentMapCategoryCommand(request.Name, request.Description, request.ParentId),
            cancellationToken);

        return result.IsSuccess
            ? Results.Created($"/environment-map-categories/{result.Value.Id}", result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> UpdateCategory(
        int id,
        [FromBody] UpsertEnvironmentMapCategoryRequest request,
        ICommandHandler<UpdateEnvironmentMapCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateEnvironmentMapCategoryCommand(id, request.Name, request.Description, request.ParentId),
            cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> DeleteCategory(
        int id,
        ICommandHandler<DeleteEnvironmentMapCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteEnvironmentMapCategoryCommand(id), cancellationToken);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }
}

public record UpsertEnvironmentMapCategoryRequest(string Name, string? Description, int? ParentId);
