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

    public SoftDeleteFileCommandHandler(
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
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

        return Result.Success();
    }
}
