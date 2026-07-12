using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Packs;

internal class DeletePackCommandHandler : ICommandHandler<DeletePackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeletePackCommandHandler(
        IPackRepository packRepository,
        IUnitOfWork unitOfWork)
    {
        _packRepository = packRepository;
        _unitOfWork = unitOfWork;
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

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record DeletePackCommand(int Id) : ICommand;
