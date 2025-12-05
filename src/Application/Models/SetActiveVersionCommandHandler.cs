using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal class SetActiveVersionCommandHandler : ICommandHandler<SetActiveVersionCommand>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _versionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SetActiveVersionCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository versionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _versionRepository = versionRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(SetActiveVersionCommand command, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure(new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        var version = await _versionRepository.GetByIdAsync(command.VersionId, cancellationToken);
        if (version == null)
        {
            return Result.Failure(new Error("VersionNotFound", $"Version with ID {command.VersionId} was not found."));
        }

        if (version.ModelId != model.Id)
        {
            return Result.Failure(new Error("InvalidVersion", $"Version {command.VersionId} does not belong to model {command.ModelId}."));
        }

        try
        {
            model.SetActiveVersion(version.Id, _dateTimeProvider.UtcNow);
            await _modelRepository.UpdateAsync(model, cancellationToken);
            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(new Error("SetActiveVersionFailed", ex.Message));
        }
    }
}

public record SetActiveVersionCommand(int ModelId, int VersionId) : ICommand;
