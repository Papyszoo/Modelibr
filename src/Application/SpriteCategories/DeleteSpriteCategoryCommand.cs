using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using SharedKernel;

namespace Application.SpriteCategories;

internal class DeleteSpriteCategoryCommandHandler : ICommandHandler<DeleteSpriteCategoryCommand>
{
    private readonly ISpriteCategoryRepository _categoryRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSpriteCategoryCommandHandler(ISpriteCategoryRepository categoryRepository, IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
    }

    public Task<Result> Handle(DeleteSpriteCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.DeleteAsync(
            _categoryRepository, command.Id, "Sprite category", _unitOfWork, cancellationToken);
}

public record DeleteSpriteCategoryCommand(int Id) : ICommand;
