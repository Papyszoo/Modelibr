using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class AddModelToProjectCommandHandler : ICommandHandler<AddModelToProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public AddModelToProjectCommandHandler(
        IProjectRepository projectRepository,
        IModelRepository modelRepository,
        IBatchUploadRepository batchUploadRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _projectRepository = projectRepository;
        _modelRepository = modelRepository;
        _batchUploadRepository = batchUploadRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(AddModelToProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);

        if (project == null)
        {
            return Result.Failure(
                new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        var model = await _modelRepository.GetByIdForAssociationAsync(command.ModelId, cancellationToken);

        if (model == null)
        {
            return Result.Failure(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        project.AddModel(model, _dateTimeProvider.UtcNow);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        // Update batch upload records for this model to include project association
        var batchUploads = await _batchUploadRepository.GetByModelIdAsync(model.Id, cancellationToken);
        foreach (var batchUpload in batchUploads)
        {
            batchUpload.UpdateProjectAssociation(project.Id);
            batchUpload.UpdateUploadType("project");
            await _batchUploadRepository.UpdateAsync(batchUpload, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}

public record AddModelToProjectCommand(int ProjectId, int ModelId) : ICommand;
