using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal class SetActiveVersionCommandHandler : ICommandHandler<SetActiveVersionCommand>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _versionRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public SetActiveVersionCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository versionRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _modelRepository = modelRepository;
        _versionRepository = versionRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
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

            // ActiveVersionChangedEvent is dispatched from the save pipeline once
            // this UpdateAsync's SaveChanges commits (see DomainEventsInterceptor);
            // no manual publish here.
            await _modelRepository.UpdateAsync(model, cancellationToken);

            // Search reads projection state only, so the current-version marker has to
            // move with the active version. Without this, switching versions left search
            // answering from whichever version was extracted last.
            await _searchDocumentRepository.SetCurrentVersionAsync(
                ExtractionAssetTypes.Model, model.Id, version.Id, cancellationToken);

            await _unitOfWork.SaveChangesAsync(cancellationToken);

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(new Error("SetActiveVersionFailed", ex.Message));
        }
    }
}

public record SetActiveVersionCommand(int ModelId, int VersionId) : ICommand;
