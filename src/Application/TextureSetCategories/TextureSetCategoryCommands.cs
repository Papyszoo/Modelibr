using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSetCategories;

internal sealed class CreateTextureSetCategoryCommandHandler : ICommandHandler<CreateTextureSetCategoryCommand, TextureSetCategorySummaryDto>
{
    private readonly ITextureSetCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateTextureSetCategoryCommandHandler(ITextureSetCategoryRepository categoryRepository, IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<TextureSetCategorySummaryDto>> Handle(CreateTextureSetCategoryCommand command, CancellationToken cancellationToken)
    {
        var result = await CategoryCommandHandlers.CreateAsync(
            _categoryRepository, command.Name, command.Description, command.ParentId,
            "texture set category", TextureSetCategory.Create, _dateTimeProvider.UtcNow, cancellationToken);

        return result.IsSuccess
            ? Result.Success(new TextureSetCategorySummaryDto
            {
                Id = result.Value.Id,
                Name = result.Value.Name,
                Description = result.Value.Description,
                ParentId = result.Value.ParentId,
                Path = result.Value.Path
            })
            : Result.Failure<TextureSetCategorySummaryDto>(result.Error);
    }
}

internal sealed class UpdateTextureSetCategoryCommandHandler : ICommandHandler<UpdateTextureSetCategoryCommand>
{
    private readonly ITextureSetCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateTextureSetCategoryCommandHandler(ITextureSetCategoryRepository categoryRepository, IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public Task<Result> Handle(UpdateTextureSetCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.UpdateAsync(
            _categoryRepository, command.Id, command.Name, command.Description, command.ParentId,
            "Texture set category", _dateTimeProvider.UtcNow, cancellationToken);
}

internal sealed class DeleteTextureSetCategoryCommandHandler : ICommandHandler<DeleteTextureSetCategoryCommand>
{
    private readonly ITextureSetCategoryRepository _categoryRepository;

    public DeleteTextureSetCategoryCommandHandler(ITextureSetCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public Task<Result> Handle(DeleteTextureSetCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.DeleteAsync(
            _categoryRepository, command.Id, "Texture set category", cancellationToken);
}

public record CreateTextureSetCategoryCommand(string Name, string? Description, int? ParentId) : ICommand<TextureSetCategorySummaryDto>;
public record UpdateTextureSetCategoryCommand(int Id, string Name, string? Description, int? ParentId) : ICommand;
public record DeleteTextureSetCategoryCommand(int Id) : ICommand;
