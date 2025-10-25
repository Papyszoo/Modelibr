using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.RecycledFiles;

public record RestoreRecycledFileCommand(int RecycledFileId) : ICommand;

internal class RestoreRecycledFileCommandHandler : ICommandHandler<RestoreRecycledFileCommand>
{
    private readonly IRecycledFileRepository _recycledFileRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RestoreRecycledFileCommandHandler(
        IRecycledFileRepository recycledFileRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _recycledFileRepository = recycledFileRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RestoreRecycledFileCommand command, CancellationToken cancellationToken)
    {
        var recycledFile = await _recycledFileRepository.GetByIdAsync(command.RecycledFileId, cancellationToken);
        
        if (recycledFile == null)
        {
            return Result.Failure(
                new Error("RecycledFileNotFound", $"Recycled file with ID {command.RecycledFileId} was not found."));
        }

        // Find the file entity (including deleted files)
        var file = await _fileRepository.GetByIdIncludingDeletedAsync(recycledFile.FileId, cancellationToken);

        if (file == null)
        {
            return Result.Failure(
                new Error("FileNotFound", $"File with ID {recycledFile.FileId} was not found."));
        }

        // Restore the file by setting Deleted = false
        file.Restore(_dateTimeProvider.UtcNow);
        await _fileRepository.UpdateAsync(file, cancellationToken);
        
        // Remove from recycle bin
        await _recycledFileRepository.DeleteAsync(command.RecycledFileId, cancellationToken);

        return Result.Success();
    }
}
