using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.SoundCategories;

internal class DeleteSoundCategoryCommandHandler : ICommandHandler<DeleteSoundCategoryCommand>
{
    private readonly ISoundCategoryRepository _categoryRepository;

    public DeleteSoundCategoryCommandHandler(ISoundCategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<Result> Handle(DeleteSoundCategoryCommand command, CancellationToken cancellationToken)
    {
        var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
        if (category == null)
        {
            return Result.Failure(
                new Error("CategoryNotFound", $"Sound category with ID {command.Id} not found."));
        }

        await _categoryRepository.DeleteAsync(command.Id, cancellationToken);

        return Result.Success();
    }
}

public record DeleteSoundCategoryCommand(int Id) : ICommand;
