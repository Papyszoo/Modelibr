using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class RemoveModelFromProjectCommandHandler : ICommandHandler<RemoveModelFromProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISceneAssetUsageRepository _sceneUsage;

    public RemoveModelFromProjectCommandHandler(
        IProjectRepository projectRepository,
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork,
        ISceneAssetUsageRepository sceneUsage)
    {
        _projectRepository = projectRepository;
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
        _sceneUsage = sceneUsage;
    }

    public async Task<Result> Handle(RemoveModelFromProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);

        if (project == null)
        {
            return Result.Failure(
                new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);

        if (model == null)
        {
            return Result.Failure(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        // Removing a row the project only holds because one of its scenes references it
        // would appear to work and change nothing (prompt 13-C).
        var derived = await ProjectSceneDerivedAssets.RefuseIfOnlySceneDerivedAsync(
            _sceneUsage, project.Id, project.HasModel(command.ModelId), Domain.Scenes.SceneAssetTypes.Model,
            command.ModelId, model.Name, cancellationToken);
        if (derived.IsFailure)
        {
            return derived;
        }

        project.RemoveModel(model, _dateTimeProvider.UtcNow);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record RemoveModelFromProjectCommand(int ProjectId, int ModelId) : ICommand;
