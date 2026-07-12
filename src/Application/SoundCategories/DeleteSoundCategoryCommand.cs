using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using SharedKernel;

namespace Application.SoundCategories;

internal class DeleteSoundCategoryCommandHandler : ICommandHandler<DeleteSoundCategoryCommand>
{
    private readonly ISoundCategoryRepository _categoryRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSoundCategoryCommandHandler(ISoundCategoryRepository categoryRepository, IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
    }

    public Task<Result> Handle(DeleteSoundCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.DeleteAsync(
            _categoryRepository, command.Id, "Sound category", _unitOfWork, cancellationToken);
}

public record DeleteSoundCategoryCommand(int Id) : ICommand;
