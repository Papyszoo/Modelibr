using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Categories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.ScriptCategories;

internal class CreateScriptCategoryCommandHandler : ICommandHandler<CreateScriptCategoryCommand, ScriptCategorySummaryDto>
{
    private readonly IScriptCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateScriptCategoryCommandHandler(
        IScriptCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<ScriptCategorySummaryDto>> Handle(CreateScriptCategoryCommand command, CancellationToken cancellationToken)
    {
        var result = await CategoryCommandHandlers.CreateAsync(
            _categoryRepository, command.Name, command.Description, command.ParentId,
            "script category", ScriptCategory.Create, _dateTimeProvider.UtcNow, cancellationToken);

        return result.IsSuccess
            ? Result.Success(new ScriptCategorySummaryDto
            {
                Id = result.Value.Id,
                Name = result.Value.Name,
                Description = result.Value.Description,
                ParentId = result.Value.ParentId,
                Path = result.Value.Path
            })
            : Result.Failure<ScriptCategorySummaryDto>(result.Error);
    }
}

public record CreateScriptCategoryCommand(string Name, string? Description = null, int? ParentId = null) : ICommand<ScriptCategorySummaryDto>;
