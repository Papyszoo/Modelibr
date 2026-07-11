using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Files;

public record SoftDeleteFileCommand(int FileId) : ICommand;

internal sealed class SoftDeleteFileCommandHandler : ICommandHandler<SoftDeleteFileCommand>
{
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public SoftDeleteFileCommandHandler(
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(SoftDeleteFileCommand command, CancellationToken cancellationToken)
    {
        var file = await _fileRepository.GetByIdAsync(command.FileId, cancellationToken);
        if (file == null)
        {
            return Result.Failure(
                new Error("FileNotFound", $"File with ID {command.FileId} not found."));
        }

        if (file.IsDeleted)
        {
            return Result.Failure(
                new Error("FileAlreadyDeleted", $"File with ID {command.FileId} is already deleted."));
        }

        file.SoftDelete(_dateTimeProvider.UtcNow);
        await _fileRepository.UpdateAsync(file, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
