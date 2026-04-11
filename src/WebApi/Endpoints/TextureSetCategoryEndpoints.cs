using Application.Abstractions.Messaging;
using Application.TextureSetCategories;
using Microsoft.AspNetCore.Mvc;

namespace WebApi.Endpoints;

public static class TextureSetCategoryEndpoints
{
    public static void MapTextureSetCategoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/texture-set-categories", GetAllCategories).WithName("Get All Texture Set Categories").WithOpenApi();
        app.MapPost("/texture-set-categories", CreateCategory).WithName("Create Texture Set Category").WithOpenApi();
        app.MapPut("/texture-set-categories/{id}", UpdateCategory).WithName("Update Texture Set Category").WithOpenApi();
        app.MapDelete("/texture-set-categories/{id}", DeleteCategory).WithName("Delete Texture Set Category").WithOpenApi();
    }

    private static async Task<IResult> GetAllCategories(
        IQueryHandler<GetAllTextureSetCategoriesQuery, GetAllTextureSetCategoriesResponse> queryHandler,
        CancellationToken cancellationToken)
    {
        var result = await queryHandler.Handle(new GetAllTextureSetCategoriesQuery(), cancellationToken);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> CreateCategory(
        [FromBody] UpsertTextureSetCategoryRequest request,
        ICommandHandler<CreateTextureSetCategoryCommand, TextureSetCategorySummaryDto> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new CreateTextureSetCategoryCommand(request.Name, request.Description, request.ParentId),
            cancellationToken);

        return result.IsSuccess
            ? Results.Created($"/texture-set-categories/{result.Value.Id}", result.Value)
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> UpdateCategory(
        int id,
        [FromBody] UpsertTextureSetCategoryRequest request,
        ICommandHandler<UpdateTextureSetCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(
            new UpdateTextureSetCategoryCommand(id, request.Name, request.Description, request.ParentId),
            cancellationToken);

        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }

    private static async Task<IResult> DeleteCategory(
        int id,
        ICommandHandler<DeleteTextureSetCategoryCommand> commandHandler,
        CancellationToken cancellationToken)
    {
        var result = await commandHandler.Handle(new DeleteTextureSetCategoryCommand(id), cancellationToken);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Code, message = result.Error.Message });
    }
}

public record UpsertTextureSetCategoryRequest(string Name, string? Description, int? ParentId);
