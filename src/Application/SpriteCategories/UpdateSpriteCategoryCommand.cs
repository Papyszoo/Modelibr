using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Services;
using SharedKernel;

namespace Application.SpriteCategories;

internal class UpdateSpriteCategoryCommandHandler : ICommandHandler<UpdateSpriteCategoryCommand>
{
    private readonly ISpriteCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSpriteCategoryCommandHandler(
        ISpriteCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public Task<Result> Handle(UpdateSpriteCategoryCommand command, CancellationToken cancellationToken)
        => CategoryCommandHandlers.UpdateAsync(
            _categoryRepository, command.Id, command.Name, command.Description, command.ParentId,
            "Sprite category", _dateTimeProvider.UtcNow, _unitOfWork, cancellationToken);
}

public record UpdateSpriteCategoryCommand(int Id, string Name, string? Description = null, int? ParentId = null) : ICommand;
