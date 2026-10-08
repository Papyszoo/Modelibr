using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal sealed class RemoveVfxFromProjectCommandHandler : ICommandHandler<RemoveVfxFromProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IVfxRepository _vfxRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveVfxFromProjectCommandHandler(
        IProjectRepository projectRepository,
        IVfxRepository vfxRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _projectRepository = projectRepository;
        _vfxRepository = vfxRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(RemoveVfxFromProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project == null)
            return Result.Failure(new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));

        var vfx = await _vfxRepository.GetByIdAsync(command.VfxId, cancellationToken);
        if (vfx == null)
            return Result.Failure(new Error("VfxNotFound", $"Vfx with ID {command.VfxId} was not found."));

        project.RemoveVfx(vfx, _dateTimeProvider.UtcNow);
        await _projectRepository.UpdateAsync(project, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record RemoveVfxFromProjectCommand(int ProjectId, int VfxId) : ICommand;
