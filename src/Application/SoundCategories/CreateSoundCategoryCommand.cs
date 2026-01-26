using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.SoundCategories;

internal class CreateSoundCategoryCommandHandler : ICommandHandler<CreateSoundCategoryCommand, CreateSoundCategoryResponse>
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

    public async Task<Result<CreateSoundCategoryResponse>> Handle(CreateSoundCategoryCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var existingCategory = await _categoryRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingCategory != null)
            {
                return Result.Failure<CreateSoundCategoryResponse>(
                    new Error("CategoryAlreadyExists", $"A sound category with the name '{command.Name}' already exists."));
            }

            var category = SoundCategory.Create(command.Name, command.Description, _dateTimeProvider.UtcNow);

            var savedCategory = await _categoryRepository.AddAsync(category, cancellationToken);

            return Result.Success(new CreateSoundCategoryResponse(savedCategory.Id, savedCategory.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateSoundCategoryResponse>(
                new Error("CategoryCreationFailed", ex.Message));
        }
    }
}

public record CreateSoundCategoryCommand(string Name, string? Description = null) : ICommand<CreateSoundCategoryResponse>;
public record CreateSoundCategoryResponse(int Id, string Name);
