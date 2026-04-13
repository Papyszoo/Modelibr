using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using SharedKernel;

namespace Application.SoundCategories;

internal class DeleteSoundCategoryCommandHandler : ICommandHandler<DeleteSoundCategoryCommand>
{
    private readonly ISoundCategoryRepository _categoryRepository;

    public DeleteSoundCategoryCommandHandler(ISoundCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public Task<Result> Handle(DeleteSoundCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.DeleteAsync(
            _categoryRepository, command.Id, "Sound category", cancellationToken);
}

public record DeleteSoundCategoryCommand(int Id) : ICommand;
