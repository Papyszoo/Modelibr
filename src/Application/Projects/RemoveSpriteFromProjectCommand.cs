using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class RemoveSpriteFromProjectCommandHandler : ICommandHandler<RemoveSpriteFromProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly ISpriteRepository _spriteRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISceneAssetUsageRepository _sceneUsage;

    public RemoveSpriteFromProjectCommandHandler(
        IProjectRepository projectRepository,
        ISpriteRepository spriteRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork,
        ISceneAssetUsageRepository sceneUsage)
    {
        _projectRepository = projectRepository;
        _spriteRepository = spriteRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
        _sceneUsage = sceneUsage;
    }

    public async Task<Result> Handle(RemoveSpriteFromProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);

        if (project == null)
        {
            return Result.Failure(
                new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        var sprite = await _spriteRepository.GetByIdAsync(command.SpriteId, cancellationToken);

        if (sprite == null)
        {
            return Result.Failure(
                new Error("SpriteNotFound", $"Sprite with ID {command.SpriteId} was not found."));
        }

        // Removing a row the project only holds because one of its scenes references it
        // would appear to work and change nothing (prompt 13-C).
        var derived = await ProjectSceneDerivedAssets.RefuseIfOnlySceneDerivedAsync(
            _sceneUsage, project.Id, project.HasSprite(command.SpriteId), Domain.Scenes.SceneAssetTypes.Sprite,
            command.SpriteId, sprite.Name, cancellationToken);
        if (derived.IsFailure)
        {
            return derived;
        }

        project.RemoveSprite(sprite, _dateTimeProvider.UtcNow);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record RemoveSpriteFromProjectCommand(int ProjectId, int SpriteId) : ICommand;
