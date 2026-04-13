using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.SoundCategories;

internal class CreateSoundCategoryCommandHandler : ICommandHandler<CreateSoundCategoryCommand, SoundCategorySummaryDto>
{
    private readonly ISoundCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateSoundCategoryCommandHandler(
        ISoundCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<SoundCategorySummaryDto>> Handle(CreateSoundCategoryCommand command, CancellationToken cancellationToken)
    {
        var result = await CategoryCommandHandlers.CreateAsync(
            _categoryRepository, command.Name, command.Description, command.ParentId,
            "sound category", SoundCategory.Create, _dateTimeProvider.UtcNow, cancellationToken);

        return result.IsSuccess
            ? Result.Success(new SoundCategorySummaryDto
            {
                Id = result.Value.Id,
                Name = result.Value.Name,
                Description = result.Value.Description,
                ParentId = result.Value.ParentId,
                Path = result.Value.Path
            })
            : Result.Failure<SoundCategorySummaryDto>(result.Error);
    }
}

public record CreateSoundCategoryCommand(string Name, string? Description = null, int? ParentId = null) : ICommand<SoundCategorySummaryDto>;
