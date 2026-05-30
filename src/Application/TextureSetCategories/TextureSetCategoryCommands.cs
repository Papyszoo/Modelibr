using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
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
        var existing = await _categoryRepository.GetByNameAsync(
            command.Name.Trim(), command.ParentId, command.Kind, cancellationToken);
        if (existing != null)
        {
            return Result.Failure<TextureSetCategorySummaryDto>(
                new Error("CategoryAlreadyExists", $"A texture set category named '{command.Name}' already exists in this branch."));
        }

        TextureSetCategory category;
        try
        {
            category = TextureSetCategory.Create(
                command.Name, command.Description, command.ParentId, command.Kind, _dateTimeProvider.UtcNow);
            await _categoryRepository.AddAsync(category, cancellationToken);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<TextureSetCategorySummaryDto>(new Error("CategoryCreationFailed", ex.Message));
        }

        var path = category.Name;
        if (command.ParentId.HasValue)
        {
            var siblings = await _categoryRepository.GetAllByKindAsync(command.Kind, cancellationToken);
            path = HierarchicalCategoryHelpers.BuildPath(category, siblings, c => c.Id, c => c.ParentId, c => c.Name);
        }

        return Result.Success(new TextureSetCategorySummaryDto
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ParentId = category.ParentId,
            Path = path
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
        {
            return Result.Failure(
                new Error("CategoryNotFound", $"Texture set category with ID {command.Id} was not found."));
        }

        if (command.ParentId.HasValue)
        {
            if (command.ParentId.Value == command.Id)
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be its own parent."));

            // Restrict the hierarchy check to the category's own kind — categories
            // never span kinds.
            var siblings = await _categoryRepository.GetAllByKindAsync(category.Kind, cancellationToken);
            if (HierarchicalCategoryHelpers.IsDescendant(command.Id, command.ParentId.Value, siblings, c => c.Id, c => c.ParentId))
                return Result.Failure(new Error("InvalidCategoryParent", "A category cannot be moved under one of its descendants."));
        }

        // Scope the duplicate-name check to the same kind so a same-named
        // category in the other kind doesn't trigger a false collision.
        var existing = await _categoryRepository.GetByNameAsync(
            command.Name.Trim(), command.ParentId, category.Kind, cancellationToken);
        if (existing != null && existing.Id != command.Id)
        {
            return Result.Failure(
                new Error("CategoryAlreadyExists", $"A texture set category named '{command.Name}' already exists in this branch."));
        }

        try
        {
            category.Update(command.Name, command.Description, _dateTimeProvider.UtcNow);
            category.MoveTo(command.ParentId, _dateTimeProvider.UtcNow);
            await _categoryRepository.UpdateAsync(category, cancellationToken);
            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(new Error("CategoryUpdateFailed", ex.Message));
        }
    }
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

public record CreateTextureSetCategoryCommand(string Name, string? Description, int? ParentId, TextureSetKind Kind) : ICommand<TextureSetCategorySummaryDto>;
public record UpdateTextureSetCategoryCommand(int Id, string Name, string? Description, int? ParentId) : ICommand;
public record DeleteTextureSetCategoryCommand(int Id) : ICommand;
