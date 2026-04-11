using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Services;
using SharedKernel;

namespace Application.SoundCategories;

internal class UpdateSoundCategoryCommandHandler : ICommandHandler<UpdateSoundCategoryCommand>
{
    private readonly ISoundCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateSoundCategoryCommandHandler(
        ISoundCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public Task<Result> Handle(UpdateSoundCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.UpdateAsync(
            _categoryRepository, command.Id, command.Name, command.Description, command.ParentId,
            "Sound category", _dateTimeProvider.UtcNow, cancellationToken);
}

public record UpdateSoundCategoryCommand(int Id, string Name, string? Description = null, int? ParentId = null) : ICommand;
