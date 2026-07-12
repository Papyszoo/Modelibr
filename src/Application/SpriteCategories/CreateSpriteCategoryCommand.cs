using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.SpriteCategories;

internal class CreateSpriteCategoryCommandHandler : ICommandHandler<CreateSpriteCategoryCommand, SpriteCategorySummaryDto>
{
    private readonly ISpriteCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public CreateSpriteCategoryCommandHandler(
        ISpriteCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<SpriteCategorySummaryDto>> Handle(CreateSpriteCategoryCommand command, CancellationToken cancellationToken)
    {
        var result = await CategoryCommandHandlers.CreateAsync(
            _categoryRepository, command.Name, command.Description, command.ParentId,
            "sprite category", SpriteCategory.Create, _dateTimeProvider.UtcNow, _unitOfWork, cancellationToken);

        return result.IsSuccess
            ? Result.Success(new SpriteCategorySummaryDto
            {
                Id = result.Value.Id,
                Name = result.Value.Name,
                Description = result.Value.Description,
                ParentId = result.Value.ParentId,
                Path = result.Value.Path
            })
            : Result.Failure<SpriteCategorySummaryDto>(result.Error);
    }
}

public record CreateSpriteCategoryCommand(string Name, string? Description = null, int? ParentId = null) : ICommand<SpriteCategorySummaryDto>;
