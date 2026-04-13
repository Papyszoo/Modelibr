using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class UpdateEnvironmentMapCommandHandler : ICommandHandler<UpdateEnvironmentMapCommand, UpdateEnvironmentMapResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateEnvironmentMapCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateEnvironmentMapResponse>> Handle(UpdateEnvironmentMapCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var environmentMap = await _environmentMapRepository.GetByIdAsync(command.Id, cancellationToken);
            if (environmentMap == null)
            {
                return Result.Failure<UpdateEnvironmentMapResponse>(
                    new Error("EnvironmentMapNotFound", $"Environment map with ID {command.Id} was not found."));
            }

            var now = _dateTimeProvider.UtcNow;

            if (!string.IsNullOrWhiteSpace(command.Name) && !string.Equals(command.Name, environmentMap.Name, StringComparison.Ordinal))
            {
                var existing = await _environmentMapRepository.GetByNameAsync(command.Name, cancellationToken);
                if (existing != null && existing.Id != environmentMap.Id)
                {
                    return Result.Failure<UpdateEnvironmentMapResponse>(
                        new Error("EnvironmentMapAlreadyExists", $"An environment map with the name '{command.Name}' already exists."));
                }

                environmentMap.UpdateName(command.Name, now);
            }

            if (command.PreviewVariantId != environmentMap.PreviewVariantId)
                environmentMap.SetPreviewVariant(command.PreviewVariantId, now);

            await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);

            return Result.Success(new UpdateEnvironmentMapResponse(environmentMap.Id, environmentMap.Name, environmentMap.PreviewVariantId));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateEnvironmentMapResponse>(new Error("EnvironmentMapUpdateFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<UpdateEnvironmentMapResponse>(new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record UpdateEnvironmentMapCommand(int Id, string? Name, int? PreviewVariantId) : ICommand<UpdateEnvironmentMapResponse>;
public record UpdateEnvironmentMapResponse(int Id, string Name, int? PreviewVariantId);
