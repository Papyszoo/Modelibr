using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class UpdateEnvironmentMapCommandHandler : ICommandHandler<UpdateEnvironmentMapCommand, UpdateEnvironmentMapResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateEnvironmentMapCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _environmentMapRepository = environmentMapRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
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
                // Renames follow the same DuplicateNamePolicy as creation: Allow keeps the
                // name as-is, Reject fails, AutoRename appends a numeric suffix. The
                // existence check excludes this environment map itself so it can keep or
                // re-case its own name without tripping the Reject policy.
                var nameResult = await AssetNameService.ResolveNameAsync(
                    command.Name, "EnvironmentMap",
                    async (name, ct) =>
                    {
                        var other = await _environmentMapRepository.GetByNameAsync(name, ct);
                        return other != null && other.Id != environmentMap.Id;
                    },
                    _environmentMapRepository.GetNamesByPrefixAsync,
                    _settingRepository, cancellationToken);
                if (nameResult.IsFailure)
                {
                    return Result.Failure<UpdateEnvironmentMapResponse>(
                        new Error("EnvironmentMapAlreadyExists", $"An environment map with the name '{command.Name}' already exists."));
                }

                environmentMap.UpdateName(nameResult.Value, now);
            }

            if (command.PreviewVariantId != environmentMap.PreviewVariantId)
                environmentMap.SetPreviewVariant(command.PreviewVariantId, now);

            await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

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
