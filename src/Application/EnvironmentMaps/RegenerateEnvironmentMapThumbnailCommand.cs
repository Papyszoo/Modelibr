using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class RegenerateEnvironmentMapThumbnailCommandHandler : ICommandHandler<RegenerateEnvironmentMapThumbnailCommand, RegenerateEnvironmentMapThumbnailResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RegenerateEnvironmentMapThumbnailCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _thumbnailQueue = thumbnailQueue;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<RegenerateEnvironmentMapThumbnailResponse>> Handle(RegenerateEnvironmentMapThumbnailCommand command, CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure<RegenerateEnvironmentMapThumbnailResponse>(
                new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));
        }

        var now = _dateTimeProvider.UtcNow;

        if (command.VariantId.HasValue && command.VariantId != environmentMap.PreviewVariantId)
            environmentMap.SetPreviewVariant(command.VariantId.Value, now);

        if (environmentMap.CustomThumbnailFileId.HasValue)
            environmentMap.SetCustomThumbnail(null, now);

        environmentMap.Touch(now);
        await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);

        var activeVariantIds = environmentMap.Variants
            .Where(v => !v.IsDeleted)
            .Select(v => v.Id)
            .ToArray();

        foreach (var activeVariantId in activeVariantIds)
            await _thumbnailQueue.EnqueueEnvironmentMapThumbnailAsync(environmentMap.Id, activeVariantId, forceRegenerate: true, cancellationToken: cancellationToken);

        return Result.Success(new RegenerateEnvironmentMapThumbnailResponse(
            environmentMap.Id,
            environmentMap.PreviewVariantId,
            activeVariantIds));
    }
}

public record RegenerateEnvironmentMapThumbnailCommand(int EnvironmentMapId, int? VariantId = null) : ICommand<RegenerateEnvironmentMapThumbnailResponse>;

public record RegenerateEnvironmentMapThumbnailResponse(
    int EnvironmentMapId,
    int? PreviewVariantId,
    IReadOnlyCollection<int> RegeneratedVariantIds);
