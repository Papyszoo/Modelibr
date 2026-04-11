using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
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
        var existingCategory = await _categoryRepository.GetByNameAsync(command.Name.Trim(), command.ParentId, cancellationToken);
        if (existingCategory != null)
        {
            return Result.Failure<SoundCategorySummaryDto>(
                new Error("CategoryAlreadyExists", $"A sound category named '{command.Name}' already exists in this branch."));
        }

        try
        {
            var category = SoundCategory.Create(command.Name, command.Description, command.ParentId, _dateTimeProvider.UtcNow);
            await _categoryRepository.AddAsync(category, cancellationToken);

            return Result.Success(new SoundCategorySummaryDto
            {
                Id = category.Id,
                Name = category.Name,
                Description = category.Description,
                ParentId = category.ParentId,
                Path = category.Name
            });
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<SoundCategorySummaryDto>(
                new Error("CategoryCreationFailed", ex.Message));
        }
    }
}

public record CreateSoundCategoryCommand(string Name, string? Description = null, int? ParentId = null) : ICommand<SoundCategorySummaryDto>;
