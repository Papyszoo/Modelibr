using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.RecycledFiles;

public record RestoreRecycledFileCommand(int RecycledFileId) : ICommand;

internal class RestoreRecycledFileCommandHandler : ICommandHandler<RestoreRecycledFileCommand>
{
    private readonly IRecycledFileRepository _recycledFileRepository;

    public RestoreRecycledFileCommandHandler(IRecycledFileRepository recycledFileRepository)
    {
        _recycledFileRepository = recycledFileRepository;
    }

    public async Task<Result> Handle(RestoreRecycledFileCommand command, CancellationToken cancellationToken)
    {
        var recycledFile = await _recycledFileRepository.GetByIdAsync(command.RecycledFileId, cancellationToken);
        
        if (recycledFile == null)
        {
            return Result.Failure(
                new Error("RecycledFileNotFound", $"Recycled file with ID {command.RecycledFileId} was not found."));
        }

        // Remove from recycle bin (the file still exists in storage, just not tracked as recycled)
        await _recycledFileRepository.DeleteAsync(command.RecycledFileId, cancellationToken);

        return Result.Success();
    }
}
