using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Scripts;

internal class UpdateScriptCommandHandler : ICommandHandler<UpdateScriptCommand, UpdateScriptResponse>
{
    private readonly IScriptRepository _scriptRepository;
    private readonly IScriptCategoryRepository _scriptCategoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateScriptCommandHandler(
        IScriptRepository scriptRepository,
        IScriptCategoryRepository scriptCategoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _scriptRepository = scriptRepository;
        _scriptCategoryRepository = scriptCategoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateScriptResponse>> Handle(UpdateScriptCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var script = await _scriptRepository.GetByIdAsync(command.Id, cancellationToken);
            if (script == null)
            {
                return Result.Failure<UpdateScriptResponse>(
                    new Error("ScriptNotFound", $"Script with ID {command.Id} not found."));
            }

            if (!string.IsNullOrWhiteSpace(command.Name) && command.Name != script.Name)
            {
                var existingScript = await _scriptRepository.GetByNameAsync(command.Name, cancellationToken);
                if (existingScript != null && existingScript.Id != script.Id)
                {
                    return Result.Failure<UpdateScriptResponse>(
                        new Error("ScriptAlreadyExists", $"A script with the name '{command.Name}' already exists."));
                }

                script.UpdateName(command.Name, _dateTimeProvider.UtcNow);
            }

            if (command.CategoryId != script.ScriptCategoryId)
            {
                if (command.CategoryId.HasValue)
                {
                    var category = await _scriptCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                    if (category == null)
                    {
                        return Result.Failure<UpdateScriptResponse>(
                            new Error("CategoryNotFound", $"Script category with ID {command.CategoryId.Value} was not found."));
                    }
                }

                script.UpdateCategory(command.CategoryId, _dateTimeProvider.UtcNow);
            }

            // Only touch the description when the request actually carried the
            // field — this keeps category-only updates (e.g. drag-to-categorize)
            // from clearing an existing description.
            if (command.UpdateDescription)
            {
                script.UpdateDescription(command.Description, _dateTimeProvider.UtcNow);
            }

            var savedScript = await _scriptRepository.UpdateAsync(script, cancellationToken);

            return Result.Success(new UpdateScriptResponse(savedScript.Id, savedScript.Name, savedScript.Description));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateScriptResponse>(
                new Error("ScriptUpdateFailed", ex.Message));
        }
    }
}

public record UpdateScriptCommand(int Id, string? Name, int? CategoryId, string? Description = null, bool UpdateDescription = false) : ICommand<UpdateScriptResponse>;
public record UpdateScriptResponse(int Id, string Name, string? Description = null);
