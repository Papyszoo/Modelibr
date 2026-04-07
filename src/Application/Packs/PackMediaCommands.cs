using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal sealed class SetPackCustomThumbnailCommandHandler : ICommandHandler<SetPackCustomThumbnailCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SetPackCustomThumbnailCommandHandler(
        IPackRepository packRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(SetPackCustomThumbnailCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));
        }

        Domain.Models.File? file = null;
        if (command.FileId.HasValue)
        {
            file = await _fileRepository.GetByIdAsync(command.FileId.Value, cancellationToken);
            if (file == null)
            {
                return Result.Failure(new Error("FileNotFound", $"File with ID {command.FileId.Value} was not found."));
            }
        }

        pack.SetCustomThumbnail(file, _dateTimeProvider.UtcNow);
        await _packRepository.UpdateAsync(pack, cancellationToken);
        return Result.Success();
    }
}

public record SetPackCustomThumbnailCommand(int PackId, int? FileId) : ICommand;