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
        var existing = await _categoryRepository.GetByNameAsync(command.Name.Trim(), command.ParentId, cancellationToken);
        if (existing != null)
            return Result.Failure<TextureSetCategorySummaryDto>(new Error("CategoryAlreadyExists", $"A texture set category named '{command.Name}' already exists in this branch."));

        var category = TextureSetCategory.Create(command.Name, command.Description, command.ParentId, _dateTimeProvider.UtcNow);
        await _categoryRepository.AddAsync(category, cancellationToken);

        return Result.Success(new TextureSetCategorySummaryDto
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ParentId = category.ParentId,
            Path = category.Name
        });
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

    public async Task<Result> Handle(UpdateTextureSetCategoryCommand command, CancellationToken cancellationToken)
    {
        var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
        if (category == null)
            return Result.Failure(new Error("CategoryNotFound", $"Texture set category with ID {command.Id} was not found."));

        if (command.ParentId.HasValue)
        {
            if (command.ParentId.Value == command.Id)
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be its own parent."));

            var allCategories = await _categoryRepository.GetAllAsync(cancellationToken);
            if (HierarchicalCategoryHelpers.IsDescendant(command.Id, command.ParentId.Value, allCategories, c => c.Id, c => c.ParentId))
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be moved under one of its descendants."));
        }

        var existing = await _categoryRepository.GetByNameAsync(command.Name.Trim(), command.ParentId, cancellationToken);
        if (existing != null && existing.Id != command.Id)
            return Result.Failure(new Error("CategoryAlreadyExists", $"A texture set category named '{command.Name}' already exists in this branch."));

        category.Update(command.Name, command.Description, _dateTimeProvider.UtcNow);
        category.MoveTo(command.ParentId, _dateTimeProvider.UtcNow);
        await _categoryRepository.UpdateAsync(category, cancellationToken);
        return Result.Success();
    }
}

internal sealed class DeleteTextureSetCategoryCommandHandler : ICommandHandler<DeleteTextureSetCategoryCommand>
{
    private readonly ITextureSetCategoryRepository _categoryRepository;

    public DeleteTextureSetCategoryCommandHandler(ITextureSetCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result> Handle(DeleteTextureSetCategoryCommand command, CancellationToken cancellationToken)
    {
        var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
        if (category == null)
            return Result.Failure(new Error("CategoryNotFound", $"Texture set category with ID {command.Id} was not found."));

        if (category.Children.Any())
            return Result.Failure(new Error("CategoryHasChildren", "Delete or move child categories before removing this category."));

        await _categoryRepository.DeleteAsync(category, cancellationToken);
        return Result.Success();
    }
}

public record CreateTextureSetCategoryCommand(string Name, string? Description, int? ParentId) : ICommand<TextureSetCategorySummaryDto>;
public record UpdateTextureSetCategoryCommand(int Id, string Name, string? Description, int? ParentId) : ICommand;
public record DeleteTextureSetCategoryCommand(int Id) : ICommand;
