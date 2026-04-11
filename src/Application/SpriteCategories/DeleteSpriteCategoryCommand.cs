using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.SpriteCategories;

internal class DeleteSpriteCategoryCommandHandler : ICommandHandler<DeleteSpriteCategoryCommand>
{
    private readonly ISpriteCategoryRepository _categoryRepository;

    public DeleteSpriteCategoryCommandHandler(ISpriteCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result> Handle(DeleteSpriteCategoryCommand command, CancellationToken cancellationToken)
    {
        var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
        if (category == null)
        {
            return Result.Failure(
                new Error("CategoryNotFound", $"Sprite category with ID {command.Id} not found."));
        }

        if (category.Children.Any())
        {
            return Result.Failure(
                new Error("CategoryHasChildren", "Delete or move child categories before removing this category."));
        }

        await _categoryRepository.DeleteAsync(category, cancellationToken);

        return Result.Success();
    }
}

public record DeleteSpriteCategoryCommand(int Id) : ICommand;
