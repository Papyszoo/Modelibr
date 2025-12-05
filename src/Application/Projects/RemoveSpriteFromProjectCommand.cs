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

    public RemoveSpriteFromProjectCommandHandler(
        IProjectRepository projectRepository,
        ISpriteRepository spriteRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _spriteRepository = spriteRepository;
        _dateTimeProvider = dateTimeProvider;
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

        project.RemoveSprite(sprite, _dateTimeProvider.UtcNow);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        return Result.Success();
    }
}

public record RemoveSpriteFromProjectCommand(int ProjectId, int SpriteId) : ICommand;
