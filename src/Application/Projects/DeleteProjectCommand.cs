using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class DeleteProjectCommandHandler : ICommandHandler<DeleteProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteProjectCommandHandler(
        IProjectRepository projectRepository,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _projectRepository = projectRepository;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(DeleteProjectCommand command, CancellationToken cancellationToken)
    {
        // Two saves inside one transaction. The project's scenes keep existing, but the
        // cascade that clears their ProjectLevelId is SET NULL, and a scene left primary
        // with no level violates CK_Scenes_PrimaryLevelRequiresLevel - so the level link
        // (and the primary flag with it) must be cleared and committed BEFORE the level
        // rows go. Unlinking and deleting in one SaveChanges would leave the order to EF's
        // command batching; splitting them makes the order explicit.
        var tx = await _unitOfWork.InTransactionAsync<bool>(async ct =>
        {
            var project = await _projectRepository.GetByIdAsync(command.Id, ct);
            if (project == null)
            {
                return Result.Failure<bool>(
                    new Error("ProjectNotFound", $"Project with ID {command.Id} was not found."));
            }

            var now = _clock.UtcNow;
            foreach (var scene in project.Scenes.Where(s => s.ProjectLevelId != null))
            {
                scene.SetLevel(null, false, now);
            }
            await _unitOfWork.SaveChangesAsync(ct);

            await _projectRepository.DeleteAsync(project, ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return Result.Success(true);
        }, cancellationToken);

        return tx.IsFailure ? Result.Failure(tx.Error) : Result.Success();
    }
}

public record DeleteProjectCommand(int Id) : ICommand;
