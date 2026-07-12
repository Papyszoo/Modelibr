using Application.Abstractions;
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
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSoundCategoryCommandHandler(
        ISoundCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public Task<Result> Handle(UpdateSoundCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.UpdateAsync(
            _categoryRepository, command.Id, command.Name, command.Description, command.ParentId,
            "Sound category", _dateTimeProvider.UtcNow, _unitOfWork, cancellationToken);
}

public record UpdateSoundCategoryCommand(int Id, string Name, string? Description = null, int? ParentId = null) : ICommand;
