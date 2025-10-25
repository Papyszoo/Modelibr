using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Models;

internal class ReorderModelVersionsCommandHandler : ICommandHandler<ReorderModelVersionsCommand, ReorderModelVersionsResponse>
{
    private readonly IModelVersionRepository _versionRepository;

    public ReorderModelVersionsCommandHandler(IModelVersionRepository versionRepository)
    {
        _versionRepository = versionRepository;
    }

    public async Task<Result<ReorderModelVersionsResponse>> Handle(
        ReorderModelVersionsCommand command,
        CancellationToken cancellationToken)
    {
        // Get all versions for this model
        var versions = await _versionRepository.GetByModelIdAsync(command.ModelId, cancellationToken);

        if (versions.Count == 0)
        {
            return Result.Failure<ReorderModelVersionsResponse>(
                new Error("ModelNotFound", $"No versions found for model with ID {command.ModelId}."));
        }

        // Validate that all version IDs in the order list exist
        var versionIds = versions.Select(v => v.Id).ToHashSet();
        if (!command.VersionIds.All(id => versionIds.Contains(id)))
        {
            return Result.Failure<ReorderModelVersionsResponse>(
                new Error("InvalidVersionIds", "One or more version IDs are invalid."));
        }

        // Update display order for each version
        for (int i = 0; i < command.VersionIds.Count; i++)
        {
            var version = versions.First(v => v.Id == command.VersionIds[i]);
            version.UpdateDisplayOrder(i);
            await _versionRepository.UpdateAsync(version, cancellationToken);
        }

        return Result.Success(new ReorderModelVersionsResponse(command.ModelId));
    }
}

public record ReorderModelVersionsCommand(
    int ModelId,
    List<int> VersionIds) : ICommand<ReorderModelVersionsResponse>;

public record ReorderModelVersionsResponse(int ModelId);
