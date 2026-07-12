using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class RemoveTextureSetFromProjectCommandHandler : ICommandHandler<RemoveTextureSetFromProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveTextureSetFromProjectCommandHandler(
        IProjectRepository projectRepository,
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _projectRepository = projectRepository;
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(RemoveTextureSetFromProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);

        if (project == null)
        {
            return Result.Failure(
                new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);

        if (textureSet == null)
        {
            return Result.Failure(
                new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
        }

        project.RemoveTextureSet(textureSet, _dateTimeProvider.UtcNow);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record RemoveTextureSetFromProjectCommand(int ProjectId, int TextureSetId) : ICommand;
