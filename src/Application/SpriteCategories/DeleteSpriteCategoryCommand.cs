using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using SharedKernel;

namespace Application.SpriteCategories;

internal class DeleteSpriteCategoryCommandHandler : ICommandHandler<DeleteSpriteCategoryCommand>
{
    private readonly ISpriteCategoryRepository _categoryRepository;

    public DeleteSpriteCategoryCommandHandler(ISpriteCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public Task<Result> Handle(DeleteSpriteCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.DeleteAsync(
            _categoryRepository, command.Id, "Sprite category", cancellationToken);
}

public record DeleteSpriteCategoryCommand(int Id) : ICommand;
