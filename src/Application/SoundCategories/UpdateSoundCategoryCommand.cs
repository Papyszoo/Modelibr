using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.SoundCategories;

internal class UpdateSoundCategoryCommandHandler : ICommandHandler<UpdateSoundCategoryCommand, UpdateSoundCategoryResponse>
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

    public async Task<Result<UpdateSoundCategoryResponse>> Handle(UpdateSoundCategoryCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var category = await _categoryRepository.GetByIdAsync(command.Id, cancellationToken);
            if (category == null)
            {
                return Result.Failure<UpdateSoundCategoryResponse>(
                    new Error("CategoryNotFound", $"Sound category with ID {command.Id} not found."));
            }

            var existingCategory = await _categoryRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingCategory != null && existingCategory.Id != command.Id)
            {
                return Result.Failure<UpdateSoundCategoryResponse>(
                    new Error("CategoryAlreadyExists", $"A sound category with the name '{command.Name}' already exists."));
            }

            category.Update(command.Name, command.Description, _dateTimeProvider.UtcNow);

            var savedCategory = await _categoryRepository.UpdateAsync(category, cancellationToken);

            return Result.Success(new UpdateSoundCategoryResponse(savedCategory.Id, savedCategory.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateSoundCategoryResponse>(
                new Error("CategoryUpdateFailed", ex.Message));
        }
    }
}

public record UpdateSoundCategoryCommand(int Id, string Name, string? Description = null) : ICommand<UpdateSoundCategoryResponse>;
public record UpdateSoundCategoryResponse(int Id, string Name);
