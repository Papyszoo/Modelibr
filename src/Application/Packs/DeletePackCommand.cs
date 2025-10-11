using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Packs;

internal class DeletePackCommandHandler : ICommandHandler<DeletePackCommand>
{
    private readonly IPackRepository _packRepository;

    public DeletePackCommandHandler(IPackRepository packRepository)
    {
        _packRepository = packRepository;
    }

    public async Task<Result> Handle(DeletePackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.Id, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(
                new Error("PackNotFound", $"Pack with ID {command.Id} was not found."));
        }

        await _packRepository.DeleteAsync(pack, cancellationToken);

        return Result.Success();
    }
}

public record DeletePackCommand(int Id) : ICommand;
